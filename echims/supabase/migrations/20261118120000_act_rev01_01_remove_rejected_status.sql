-- ACT-REV01: health activities have no "Rejected" status. The PHN approves or returns a
-- request for revision (NEEDS_REVISION); the requester edits and resubmits it.
--
-- Backup of the only REJECTED row before this change (2026-11-18), status is the only field changed:
-- {"schedule_id":5,"activity_type":"NUTRITIONAL_ASSESSMENT","schedule_date":"2026-10-06",
--  "start_time":"09:00:00","end_time":"17:00:00","status":"REJECTED","barangay_id":10,
--  "created_by":"f108eb03-c503-4113-a52f-b6e16427a31b","reviewed_by":"f2d87832-c761-491e-b624-4ba9ca230f0c",
--  "reviewed_at":"2026-10-05T10:00:44.662+00:00","review_remarks":"Not Available",
--  "updated_at":"2026-10-05T10:01:24.951297+00:00"}

-- The transition guard treats REJECTED as closed; pause it for this one data fix only.
ALTER TABLE public.health_activity_schedule DISABLE TRIGGER guard_health_activity_status_transitions;
UPDATE public.health_activity_schedule
SET status = 'NEEDS_REVISION'
WHERE status = 'REJECTED';
ALTER TABLE public.health_activity_schedule ENABLE TRIGGER guard_health_activity_status_transitions;

-- A REJECTED status can no longer be written, so this guard is dead.
DROP TRIGGER IF EXISTS nip_block_vaccination_schedule_reject ON public.health_activity_schedule;
DROP FUNCTION IF EXISTS public.nip_block_vaccination_schedule_reject();

ALTER TABLE public.health_activity_schedule
  DROP CONSTRAINT IF EXISTS health_activity_schedule_status_check;

ALTER TABLE public.health_activity_schedule
  ADD CONSTRAINT health_activity_schedule_status_check
  CHECK (status IN ('PENDING', 'NEEDS_REVISION', 'APPROVED', 'ONGOING', 'COMPLETED', 'CANCELLED'));

-- Same function as live, without the REJECTED event.
CREATE OR REPLACE FUNCTION public.notify_health_activity_action()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_rule_id bigint;
  v_rule_status text;
  v_event text;
  v_title text;
  v_message text;
  v_activity_name text;
  v_barangay_name text;
  v_rhu_id bigint;
  v_event_key text;
  v_schedule_changed boolean := false;
BEGIN
  SELECT rule_id, status
  INTO v_rule_id, v_rule_status
  FROM public.alert_rule
  WHERE rule_name = 'HEALTH_ACTIVITY_ACTION_NOTIFICATION'
    AND rule_category = 'HEALTH_ACTIVITY'
  ORDER BY rule_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Health activity notification rule is missing.';
  END IF;

  -- Deactivating the rule disables these notifications.
  IF v_rule_status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  SELECT barangay_name, rhu_id
  INTO v_barangay_name, v_rhu_id
  FROM public.barangay
  WHERE barangay_id = NEW.barangay_id;

  v_activity_name :=
    CASE NEW.activity_type
      WHEN 'VACCINATION' THEN 'Vaccination'
      WHEN 'NUTRITIONAL_ASSESSMENT'
        THEN 'Nutritional Assessment'
      WHEN 'SUPPLEMENTATION' THEN 'Supplementation'
      ELSE NEW.activity_type
    END;

  IF TG_OP = 'INSERT' THEN
    v_event := 'REQUESTED';
  ELSE
    v_schedule_changed :=
      NEW.schedule_date IS DISTINCT FROM OLD.schedule_date
      OR NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.end_time IS DISTINCT FROM OLD.end_time
      OR NEW.barangay_id IS DISTINCT FROM OLD.barangay_id
      OR NEW.activity_type IS DISTINCT FROM OLD.activity_type;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_event :=
        CASE
          WHEN NEW.status = 'APPROVED' THEN 'APPROVED'
          WHEN NEW.status = 'NEEDS_REVISION'
            THEN 'RETURNED_FOR_REVISION'
          WHEN OLD.status = 'NEEDS_REVISION'
               AND NEW.status = 'PENDING'
            THEN 'RESUBMITTED'
          WHEN OLD.status = 'APPROVED'
               AND NEW.status = 'PENDING'
            THEN 'RESCHEDULED'
          WHEN NEW.status = 'ONGOING' THEN 'STARTED'
          WHEN NEW.status = 'COMPLETED' THEN 'COMPLETED'
          WHEN NEW.status = 'CANCELLED' THEN 'CANCELLED'
          ELSE 'UPDATED'
        END;
    ELSIF v_schedule_changed THEN
      v_event := 'RESCHEDULED';
    ELSIF NEW.remarks IS DISTINCT FROM OLD.remarks THEN
      v_event := 'UPDATED';
    ELSE
      -- Avoid notifications for timestamp/conflict-only updates.
      RETURN NEW;
    END IF;
  END IF;

  v_title :=
    CASE v_event
      WHEN 'REQUESTED' THEN 'New health activity request'
      WHEN 'RESUBMITTED' THEN 'Activity resubmitted for review'
      WHEN 'APPROVED' THEN 'Health activity approved'
      WHEN 'RETURNED_FOR_REVISION'
        THEN 'Health activity returned for revision'
      WHEN 'RESCHEDULED' THEN 'Health activity rescheduled'
      WHEN 'STARTED' THEN 'Health activity started'
      WHEN 'COMPLETED' THEN 'Health activity completed'
      WHEN 'CANCELLED' THEN 'Health activity cancelled'
      ELSE 'Health activity updated'
    END;

  v_message := pg_catalog.format(
    '%s — activity #%s: %s in %s. Schedule: %s, %s–%s. Status: %s.',
    v_title,
    NEW.schedule_id,
    v_activity_name,
    COALESCE(v_barangay_name, 'Assigned barangay'),
    NEW.schedule_date,
    COALESCE(NEW.start_time::text, 'Not specified'),
    COALESCE(NEW.end_time::text, 'Not specified'),
    NEW.status
  );

  IF v_event IN (
    'APPROVED', 'RETURNED_FOR_REVISION'
  ) AND NULLIF(
    pg_catalog.btrim(NEW.review_remarks), ''
  ) IS NOT NULL THEN
    v_message :=
      v_message || ' PHN remarks: ' || NEW.review_remarks;
  END IF;

  IF v_event = 'CANCELLED' THEN
    v_message :=
      v_message || ' Reason: ' ||
      COALESCE(NEW.cancellation_reason, 'Not recorded');
  END IF;

  IF v_event = 'COMPLETED' THEN
    v_message :=
      v_message || ' Completion date: ' ||
      COALESCE(NEW.completion_date::text, 'Not recorded');
  END IF;

  IF v_event = 'RESCHEDULED'
     AND NEW.status = 'PENDING' THEN
    v_message :=
      v_message || ' Renewed PHN approval is required.';
  END IF;

  v_event_key :=
    'HEALTH_ACTIVITY:' || NEW.schedule_id::text ||
    ':' || v_event ||
    ':' || pg_catalog.gen_random_uuid()::text;

  INSERT INTO public.alert (
    alert_type,
    alert_message,
    severity,
    status,
    rule_id,
    recipient_id,
    actor_id,
    schedule_id,
    source_module,
    event_key
  )
  SELECT
    'HEALTH_ACTIVITY',
    v_message,
    'LOW',
    'UNREAD',
    v_rule_id,
    recipients.user_id,
    auth.uid(),
    NEW.schedule_id,
    'HEALTH_ACTIVITY',
    v_event_key
  FROM (
    -- Active requester.
    SELECT u.user_id
    FROM public.users u
    WHERE u.user_id = NEW.created_by
      AND u.account_status = 'ACTIVE'

    UNION

    -- Active PHNs assigned to the activity's RHU.
    SELECT phn.user_id
    FROM public.public_health_nurse phn
    JOIN public.users u ON u.user_id = phn.user_id
    WHERE phn.rhu_id = v_rhu_id
      AND u.account_status = 'ACTIVE'

    UNION

    -- Affected personnel for schedule changes/cancellation.
    SELECT hp.user_id
    FROM public.health_activity_personnel hp
    JOIN public.users u ON u.user_id = hp.user_id
    WHERE hp.schedule_id = NEW.schedule_id
      AND u.account_status = 'ACTIVE'
      AND v_event IN ('RESCHEDULED', 'CANCELLED')
  ) recipients;

  RETURN NEW;
END;
$function$;

-- Same as live, minus REJECTED (closed states and PENDING transitions).
CREATE OR REPLACE FUNCTION public.guard_health_activity_status_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_schedule_changed boolean;
  v_today date :=
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;
BEGIN
  v_schedule_changed :=
    NEW.activity_type IS DISTINCT FROM OLD.activity_type
    OR NEW.schedule_date IS DISTINCT FROM OLD.schedule_date
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
    OR NEW.end_time IS DISTINCT FROM OLD.end_time
    OR NEW.barangay_id IS DISTINCT FROM OLD.barangay_id;

  -- Preserve the original requester.
  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'The original requester and creation date cannot be changed.'
      USING ERRCODE = '22023';
  END IF;

  -- Finished activities cannot be edited or reopened.
  IF OLD.status IN ('CANCELLED', 'COMPLETED') THEN
    IF (pg_catalog.to_jsonb(NEW) - 'updated_at')
       IS DISTINCT FROM
       (pg_catalog.to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION
        'Cancelled or completed activities cannot be changed.'
        USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
  END IF;

  -- Validate status transitions.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (
        OLD.status = 'PENDING'
        AND NEW.status IN (
          'APPROVED', 'NEEDS_REVISION', 'CANCELLED'
        )
      )
      OR (
        OLD.status = 'NEEDS_REVISION'
        AND NEW.status IN ('PENDING', 'CANCELLED')
      )
      OR (
        OLD.status = 'APPROVED'
        AND NEW.status IN (
          'PENDING', 'ONGOING', 'COMPLETED', 'CANCELLED'
        )
      )
      OR (
        OLD.status = 'ONGOING'
        AND NEW.status IN ('COMPLETED', 'CANCELLED')
      )
    ) THEN
      RAISE EXCEPTION
        'Invalid activity status transition: % to %.',
        OLD.status, NEW.status
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Changes to an approved schedule require renewed approval.
  IF OLD.status = 'APPROVED'
     AND v_schedule_changed
     AND NEW.status <> 'PENDING' THEN
    RAISE EXCEPTION
      'A changed approved schedule must return to PENDING for PHN review.'
      USING ERRCODE = '22023';
  END IF;

  -- Rescheduling cannot happen after the activity starts.
  IF OLD.status = 'ONGOING' AND v_schedule_changed THEN
    RAISE EXCEPTION
      'An ongoing activity cannot be rescheduled.'
      USING ERRCODE = '22023';
  END IF;

  -- Clear previous approval when reopening an approved request.
  IF OLD.status = 'APPROVED' AND NEW.status = 'PENDING' THEN
    IF NOT v_schedule_changed THEN
      RAISE EXCEPTION
        'Provide a schedule change before requesting renewed approval.'
        USING ERRCODE = '22023';
    END IF;

    NEW.approved_by := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_remarks := NULL;
  END IF;

  -- A future activity cannot be started or completed.
  IF NEW.status IN ('ONGOING', 'COMPLETED')
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.schedule_date > v_today THEN
    RAISE EXCEPTION
      'A future activity cannot be started or completed.'
      USING ERRCODE = '22023';
  END IF;

  -- Cancellation requires a reason.
  IF NEW.status = 'CANCELLED' THEN
    IF NULLIF(
      pg_catalog.btrim(NEW.cancellation_reason), ''
    ) IS NULL THEN
      RAISE EXCEPTION
        'A cancellation reason is required.'
        USING ERRCODE = '22023';
    END IF;

    NEW.cancellation_reason :=
      pg_catalog.btrim(NEW.cancellation_reason);
    NEW.cancelled_at := CURRENT_TIMESTAMP;
    NEW.cancelled_by := auth.uid();
  ELSE
    NEW.cancellation_reason := NULL;
    NEW.cancelled_at := NULL;
    NEW.cancelled_by := NULL;
  END IF;

  -- Record the actual completion date and submitting user.
  IF NEW.status = 'COMPLETED' THEN
    IF NEW.completion_date IS NULL
       OR NEW.completion_date < NEW.schedule_date
       OR NEW.completion_date > v_today THEN
      RAISE EXCEPTION
        'Completion date must be between the scheduled date and today.'
        USING ERRCODE = '22023';
    END IF;

    NEW.completed_at := CURRENT_TIMESTAMP;
    NEW.completed_by := auth.uid();
  ELSE
    NEW.completion_date := NULL;
    NEW.completed_at := NULL;
    NEW.completed_by := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- Same as live; approval is the only PHN-only status change (no rejection).
CREATE OR REPLACE FUNCTION public.protect_health_activity_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_is_admin boolean;
    v_is_phn boolean;
BEGIN
    v_is_admin := public.is_active_administrator();

    SELECT EXISTS (
        SELECT 1
        FROM public.public_health_nurse phn
        JOIN public.users u
          ON u.user_id = phn.user_id
        WHERE phn.user_id = auth.uid()
          AND u.account_status = 'ACTIVE'
    )
    INTO v_is_phn;

    -- Admin is retained for administrative/system maintenance.
    IF v_is_admin THEN
        RETURN NEW;
    END IF;

    -- Review-controlled fields may only be changed by a PHN.
    IF
        NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
        OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
        OR NEW.review_remarks IS DISTINCT FROM OLD.review_remarks
    THEN
        IF NOT v_is_phn THEN
            RAISE EXCEPTION
                'Only an active Public Health Nurse may modify review fields.';
        END IF;

        IF NOT public.is_phn_assigned_to_rhu(NEW.barangay_id) THEN
            RAISE EXCEPTION
                'Public Health Nurse is not assigned to this RHU.';
        END IF;
    END IF;

    -- Approval is PHN-controlled.
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'APPROVED' THEN
        IF NOT v_is_phn THEN
            RAISE EXCEPTION
                'Only an active Public Health Nurse may approve an activity.';
        END IF;

        IF NOT public.is_phn_assigned_to_rhu(NEW.barangay_id) THEN
            RAISE EXCEPTION
                'Public Health Nurse is not assigned to this RHU.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
