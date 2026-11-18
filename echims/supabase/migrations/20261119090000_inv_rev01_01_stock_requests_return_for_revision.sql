-- INV-REV01: stock requests (replenishment, vaccine batch, supplement batch) have no "Rejected".
-- The PHN approves a request or returns it for revision (NEEDS_REVISION, with a note in `reason`);
-- the requester edits it and resubmits it (back to PENDING).
--
-- Backup of the two REJECTED rows before this change (2026-11-19); only status changes:
-- {"stock_request_id":2,"request_type":"SUPPLEMENT_BATCH","status":"REJECTED","requested_quantity":500,
--  "item_id":11,"target_barangay_id":12,"reason":"Not Available","approved_by":"f2d87832-c761-491e-b624-4ba9ca230f0c",
--  "approved_at":"2026-10-12T13:22:45.86346+00:00","requested_by":"f108eb03-c503-4113-a52f-b6e16427a31b"}
-- {"stock_request_id":6,"request_type":"REPLENISHMENT","status":"REJECTED","requested_quantity":100,
--  "item_id":9,"target_barangay_id":12,"reason":"test","batch_number":"DEMO-REPL-002",
--  "approved_by":"f2d87832-c761-491e-b624-4ba9ca230f0c","approved_at":"2026-10-16T02:10:58.856511+00:00",
--  "requested_by":"f108eb03-c503-4113-a52f-b6e16427a31b"}

UPDATE public.stock_request SET status = 'NEEDS_REVISION' WHERE status = 'REJECTED';

-- Same six statuses as the rest of the system.
ALTER TABLE public.stock_request DROP CONSTRAINT IF EXISTS stock_request_status_check;
ALTER TABLE public.stock_request
  ADD CONSTRAINT stock_request_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'NEEDS_REVISION', 'ONGOING', 'COMPLETED', 'CANCELLED'));

-- Replenishment: APPROVE or RETURN (for revision; a note is required).
CREATE OR REPLACE FUNCTION public.inv_decide_replenishment(p_stock_request_id bigint, p_decision text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_req public.stock_request%ROWTYPE;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('APPROVE', 'RETURN') THEN
    RAISE EXCEPTION 'decision must be APPROVE or RETURN.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req FROM public.stock_request
    WHERE stock_request_id = p_stock_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.request_type <> 'REPLENISHMENT' THEN
    RAISE EXCEPTION 'Replenishment request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Request is already %.', lower(replace(v_req.status, '_', ' ')) USING ERRCODE = '23505';
  END IF;

  -- PHN-only + target barangay must be in the PHN's RHU
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.public_health_nurse phn ON phn.user_id = u.user_id
    JOIN public.barangay b ON b.rhu_id = phn.rhu_id AND b.barangay_id = v_req.target_barangay_id
    WHERE u.user_id = auth.uid() AND u.account_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Only a Public Health Nurse of this RHU can decide this request.'
      USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'RETURN' AND coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Say what the requester needs to change.' USING ERRCODE = '22023';
  END IF;

  v_status := CASE WHEN p_decision = 'APPROVE' THEN 'APPROVED' ELSE 'NEEDS_REVISION' END;

  UPDATE public.stock_request SET
    status = v_status,
    approved_by = auth.uid(),
    approved_at = NOW(),
    reason = CASE WHEN p_decision = 'RETURN' THEN btrim(p_reason) ELSE reason END
  WHERE stock_request_id = p_stock_request_id;

  RETURN jsonb_build_object('stock_request_id', p_stock_request_id, 'status', v_status);
END;
$function$;

-- Supplement batch: return for revision (replaces reject_supplement_stock_request).
DROP FUNCTION IF EXISTS public.reject_supplement_stock_request(bigint, text);

CREATE OR REPLACE FUNCTION public.return_supplement_stock_request(p_stock_request_id bigint, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_saved public.stock_request%ROWTYPE; v_reason text:=pg_catalog.btrim(p_reason);
BEGIN
 IF public.msp_stock_request_role() IS DISTINCT FROM 'PHN' THEN
  RAISE EXCEPTION 'Only the supervising PHN may return a supplement stock request.' USING ERRCODE='42501'; END IF;
 IF v_reason IS NULL OR v_reason='' OR pg_catalog.length(v_reason)>2000 THEN
  RAISE EXCEPTION 'Say what needs to change (up to 2000 characters).' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_saved FROM public.stock_request WHERE stock_request_id=p_stock_request_id
  AND request_type='SUPPLEMENT_BATCH' FOR UPDATE;
 IF NOT FOUND OR NOT public.msp_stock_request_scope(v_saved.target_barangay_id) THEN
  RAISE EXCEPTION 'Request not found or outside your RHU.' USING ERRCODE='42501'; END IF;
 IF v_saved.status='NEEDS_REVISION' AND v_saved.approved_by=auth.uid() AND v_saved.reason=v_reason THEN
  RETURN pg_catalog.jsonb_build_object('stock_request_id',v_saved.stock_request_id,'status','NEEDS_REVISION','replayed',true); END IF;
 IF v_saved.status<>'PENDING' THEN RAISE EXCEPTION 'This request has already been reviewed.' USING ERRCODE='23505'; END IF;
 UPDATE public.stock_request SET status='NEEDS_REVISION',approved_by=auth.uid(),approved_at=pg_catalog.now(),reason=v_reason
 WHERE stock_request_id=v_saved.stock_request_id;
 RETURN pg_catalog.jsonb_build_object('stock_request_id',v_saved.stock_request_id,'status','NEEDS_REVISION','replayed',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.return_supplement_stock_request(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_supplement_stock_request(bigint, text) TO authenticated;

-- Any request type: the requester edits a returned request and sends it back to PENDING.
-- Vaccine batch requests may also correct the batch number. The PHN note is cleared.
CREATE OR REPLACE FUNCTION public.inv_resubmit_stock_request(
  p_stock_request_id bigint, p_quantity numeric, p_remarks text, p_batch_number text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_req public.stock_request%ROWTYPE;
  v_remarks text := NULLIF(pg_catalog.btrim(p_remarks), '');
  v_batch text := NULLIF(pg_catalog.btrim(p_batch_number), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.stock_request WHERE stock_request_id = p_stock_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.requested_by IS DISTINCT FROM auth.uid() OR NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.user_id = auth.uid() AND u.account_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Only the person who made this request can resubmit it.' USING ERRCODE = '42501';
  END IF;
  IF v_req.status <> 'NEEDS_REVISION' THEN
    RAISE EXCEPTION 'Only a request returned for revision can be resubmitted.' USING ERRCODE = '23505';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> pg_catalog.trunc(p_quantity) OR p_quantity > 1000000
     OR pg_catalog.length(COALESCE(v_remarks, '')) > 2000 THEN
    RAISE EXCEPTION 'Enter a whole quantity between 1 and 1000000, and remarks up to 2000 characters.' USING ERRCODE = '22023';
  END IF;
  IF v_req.request_type = 'VACCINE_BATCH' AND v_batch IS NULL THEN
    RAISE EXCEPTION 'A vaccine batch request needs a batch number.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stock_request SET
    status = 'PENDING',
    requested_quantity = p_quantity,
    remarks = v_remarks,
    batch_number = CASE WHEN v_req.request_type = 'VACCINE_BATCH' THEN v_batch ELSE batch_number END,
    reason = NULL,
    approved_by = NULL,
    approved_at = NULL
  WHERE stock_request_id = p_stock_request_id;

  RETURN pg_catalog.jsonb_build_object('stock_request_id', p_stock_request_id, 'status', 'PENDING');
END;
$function$;

REVOKE ALL ON FUNCTION public.inv_resubmit_stock_request(bigint, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inv_resubmit_stock_request(bigint, numeric, text, text) TO authenticated;

-- Same as live; the PHN flag is canReturn (was canReject).
CREATE OR REPLACE FUNCTION public.get_supplement_stock_requests()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_role text:=public.msp_stock_request_role();
BEGIN
 IF v_role IS NULL THEN RAISE EXCEPTION 'An active staff account is required.' USING ERRCODE='42501'; END IF;
 RETURN pg_catalog.jsonb_build_object('currentUserId',auth.uid(),'role',v_role,
  'canRequest',v_role='RHM','canReturn',v_role='PHN','canApprove',v_role='PHN',
  'allocationConnected',false,'approvalMode','TEMPORARY_RECEIPT',
  'barangays',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'barangay_id',b.barangay_id,'barangay_name',b.barangay_name,'rhu_name',r.rhu_name) ORDER BY b.barangay_name)
    FROM public.barangay b JOIN public.rhu r ON r.rhu_id=b.rhu_id
    WHERE public.msp_stock_request_scope(b.barangay_id)), '[]'::jsonb),
  'products',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'supplement_id',s.supplement_id,'name',i.item_name,'unit',i.unit) ORDER BY i.item_name)
    FROM public.supplement s JOIN public.item i ON i.item_id=s.supplement_id
    WHERE i.status='ACTIVE' AND s.catalog_code IS NOT NULL), '[]'::jsonb),
  'requests',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.stock_request_id DESC)
    FROM (SELECT sr.stock_request_id,sr.request_date,sr.requested_quantity,sr.status,sr.remarks,sr.reason,
      sr.approved_at,sr.batch_number,sr.supplement_approval_mode,sr.item_id,sr.target_barangay_id,i.item_name,i.unit,b.barangay_name,
      r.rhu_name,u.full_name AS requester_name,sr.requested_by
     FROM public.stock_request sr JOIN public.item i ON i.item_id=sr.item_id
     JOIN public.barangay b ON b.barangay_id=sr.target_barangay_id JOIN public.rhu r ON r.rhu_id=b.rhu_id
     JOIN public.users u ON u.user_id=sr.requested_by
     WHERE sr.request_type='SUPPLEMENT_BATCH' AND public.msp_stock_request_scope(sr.target_barangay_id)
     ORDER BY sr.stock_request_id DESC LIMIT 200) q), '[]'::jsonb));
END;
$function$;
