-- NIP-REV01 backend 07 — vaccination records: "Needs correction" instead of permanent rejection.
-- * Status values: PENDING · APPROVED · NEEDS_CORRECTION (REJECTED removed). The one existing
--   REJECTED record moves to NEEDS_CORRECTION; its old status and note are kept in history.
-- * vaccination_record_review_event: every return, resubmission and approval with its note.
-- * msp_review_vaccination_record: action RETURN (REJECT still accepted as an alias) needs a note,
--   sets NEEDS_CORRECTION and alerts the recorder. APPROVE is unchanged apart from the history row.
-- * echims_resubmit_vaccination_record: the recorder (or the RHU's PHN / Admin) sends a corrected
--   record back to Awaiting approval and the RHU's PHNs are alerted.
-- * Guard trigger: status / approval columns change only through those two functions (before,
--   a recorder could set status directly through the API). New records start PENDING; prior
--   (history) records may be inserted APPROVED, as the "Add past vaccination" flow does.
-- Backup: backup_nip_rev01_be.vaccination_record, backup_nip_rev01_be.functions.

create table if not exists public.vaccination_record_review_event (
  event_id bigint generated always as identity primary key,
  vaccination_record_id bigint not null references public.vaccination_record(vaccination_record_id) on delete cascade,
  action text not null check (action in ('RETURNED', 'RESUBMITTED', 'APPROVED', 'MIGRATED')),
  from_status text,
  to_status text not null,
  note text check (note is null or length(note) <= 2000),
  actor_id uuid references public.users(user_id),
  created_at timestamptz not null default now()
);
create index if not exists vaccination_record_review_event_record_idx on public.vaccination_record_review_event (vaccination_record_id, created_at);
comment on table public.vaccination_record_review_event is 'History of vaccination record reviews: returns for correction (with the PHN note), resubmissions and approvals.';

alter table public.vaccination_record_review_event enable row level security;
-- Visible to whoever can see the record (the record's own RLS applies inside the subquery).
drop policy if exists vrre_select on public.vaccination_record_review_event;
create policy vrre_select on public.vaccination_record_review_event for select to authenticated
  using (exists (select 1 from public.vaccination_record vr where vr.vaccination_record_id = vaccination_record_review_event.vaccination_record_id));
revoke all on public.vaccination_record_review_event from anon, authenticated;
grant select on public.vaccination_record_review_event to authenticated;

-- Status values: migrate REJECTED first (history row keeps the old status and note).
alter table public.vaccination_record drop constraint if exists vaccination_record_status_check;
insert into public.vaccination_record_review_event (vaccination_record_id, action, from_status, to_status, note, actor_id, created_at)
select vaccination_record_id, 'MIGRATED', 'REJECTED', 'NEEDS_CORRECTION', review_remarks, approved_by, coalesce(approved_at, now())
from public.vaccination_record where status = 'REJECTED';
update public.vaccination_record set status = 'NEEDS_CORRECTION', approved_by = null, approved_at = null where status = 'REJECTED';
alter table public.vaccination_record add constraint vaccination_record_status_check
  check (status in ('PENDING', 'APPROVED', 'NEEDS_CORRECTION'));

-- Alert rule for the two review notifications. alr_validate_rule only lets an Admin create
-- inventory / NIP_DOSE_OVERDUE rules from the UI; this EXTERNAL rule (like the CFU_* rules) is
-- added here with that one trigger off for this insert. The audit trigger stays on.
alter table public.alert_rule disable trigger alr_validate_rule;
insert into public.alert_rule (rule_name, description, rule_category, condition_logic, severity, status, evaluator_type)
select 'NIP_RECORD_REVIEW', 'A vaccination record was returned for correction, or resubmitted for approval.', 'VACCINATION',
       'Raised by msp_review_vaccination_record (RETURN) and echims_resubmit_vaccination_record.', 'MEDIUM', 'ACTIVE', 'EXTERNAL'
where not exists (select 1 from public.alert_rule where rule_name = 'NIP_RECORD_REVIEW');
alter table public.alert_rule enable trigger alr_validate_rule;

-- Guard: only the review / resubmit functions change status and approval columns.
create or replace function public.echims_guard_vaccination_record_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(pg_catalog.current_setting('echims.vr_workflow', true), '') = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status = 'PENDING' or (new.status = 'APPROVED' and coalesce(new.is_prior, false)) then return new; end if;
    raise exception 'New vaccination records start as Awaiting approval (past records may be saved as approved).' using errcode = '42501';
  end if;
  if row(new.status, new.approved_by, new.approved_at, new.review_remarks) is distinct from row(old.status, old.approved_by, old.approved_at, old.review_remarks) then
    raise exception 'A record''s status changes only through review or resubmission.' using errcode = '42501';
  end if;
  return new;
end
$$;
drop trigger if exists echims_guard_vaccination_record_status on public.vaccination_record;
create trigger echims_guard_vaccination_record_status before insert or update on public.vaccination_record
  for each row execute function public.echims_guard_vaccination_record_status();

-- Review: RETURN (alias REJECT) or APPROVE.
create or replace function public.msp_review_vaccination_record(p_record_id bigint, p_action text, p_review_remarks text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_record public.vaccination_record%rowtype;
  v_child public.child%rowtype;
  v_action text := upper(trim(coalesce(p_action, '')));
  v_inventory public.inventory%rowtype;
  v_batch public.inventory_batch%rowtype;
  v_inventory_batch_id bigint;
  v_transaction_id bigint;
  v_batch_number text;
  v_remarks text := nullif(trim(coalesce(p_review_remarks, '')), '');
  v_comp record;
  v_c_inv public.inventory%rowtype;
  v_c_batch public.inventory_batch%rowtype;
  v_c_tx bigint;
  v_companions jsonb := '[]'::jsonb;
  v_event bigint;
  v_vaccine text;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_action = 'REJECT' then v_action := 'RETURN'; end if; -- old clients
  if v_action not in ('APPROVE', 'RETURN') then raise exception 'INVALID_ACTION'; end if;

  select * into v_record from public.vaccination_record where vaccination_record_id = p_record_id for update;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  if upper(v_record.status::text) <> 'PENDING' then raise exception 'RECORD_ALREADY_REVIEWED:%', v_record.status::text; end if;

  select * into v_child from public.child where child_id = v_record.child_id;
  if not found then raise exception 'CHILD_NOT_FOUND'; end if;

  if not exists (select 1 from public.administrator a where a.user_id = v_user_id)
     and not exists (select 1 from public.public_health_nurse phn join public.barangay b on b.rhu_id = phn.rhu_id
                     where phn.user_id = v_user_id and b.barangay_id = v_child.barangay_id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  perform pg_catalog.set_config('echims.vr_workflow', 'on', true);
  select coalesce(v.vaccine_type, 'vaccine') into v_vaccine from public.vaccine v where v.vaccine_id = v_record.vaccine_id;

  if v_action = 'RETURN' then
    if v_remarks is null then raise exception 'A note is required when returning a record for correction.' using errcode = '22023'; end if;
    update public.vaccination_record set status = 'NEEDS_CORRECTION', approved_by = null, approved_at = null, review_remarks = v_remarks
    where vaccination_record_id = p_record_id;
    insert into public.vaccination_record_review_event (vaccination_record_id, action, from_status, to_status, note, actor_id)
    values (p_record_id, 'RETURNED', 'PENDING', 'NEEDS_CORRECTION', v_remarks, v_user_id) returning event_id into v_event;
    -- Tell the recorder (if they still have an active account).
    insert into public.alert (alert_type, alert_message, severity, status, rule_id, child_id, recipient_id, actor_id, source_module, event_key)
    select 'NIP_RECORD_NEEDS_CORRECTION',
      pg_catalog.format('Vaccination record needs correction: %s, %s dose %s. Note: %s',
        pg_catalog.concat_ws(' ', v_child.first_name, v_child.middle_name, v_child.last_name), v_vaccine, v_record.dose_number, left(v_remarks, 300)),
      'MEDIUM', 'UNREAD', r.rule_id, v_record.child_id, v_record.recorded_by, v_user_id, 'VACCINATION_RECORD', 'VR_REVIEW:' || v_event
    from public.alert_rule r join public.users u on u.user_id = v_record.recorded_by
    where r.rule_name = 'NIP_RECORD_REVIEW' and r.status = 'ACTIVE' and u.account_status = 'ACTIVE'
    on conflict (recipient_id, event_key) where recipient_id is not null and event_key is not null do nothing;
    return jsonb_build_object('vaccination_record_id', p_record_id, 'status', 'NEEDS_CORRECTION', 'review_remarks', v_remarks,
      'stock_deducted', 0, 'inventory_batch_id', null, 'inventory_transaction_id', null, 'companions', '[]'::jsonb, 'event_id', v_event);
  end if;

  select * into v_inventory from public.inventory where barangay_id = v_child.barangay_id and item_id = v_record.vaccine_id for update;
  if not found then raise exception 'NO_INVENTORY'; end if;
  if coalesce(v_inventory.quantity_on_hand, 0) < 1 then raise exception 'INSUFFICIENT_STOCK'; end if;

  if nullif(trim(coalesce(v_record.batch_number, '')), '') is not null then
    select * into v_batch from public.inventory_batch
    where inventory_id = v_inventory.inventory_id and batch_number = trim(v_record.batch_number) and quantity_on_hand > 0
    order by expiry_date asc, batch_id asc limit 1 for update;
  else
    select * into v_batch from public.inventory_batch
    where inventory_id = v_inventory.inventory_id and quantity_on_hand > 0
    order by expiry_date asc, batch_id asc limit 1 for update;
  end if;
  if not found then raise exception 'NO_BATCH_STOCK'; end if;

  if coalesce((select sum(quantity_on_hand) from public.inventory_batch where inventory_id = v_inventory.inventory_id), 0) > v_inventory.quantity_on_hand then
    raise exception 'INVENTORY_BATCH_TOTAL_EXCEEDS_AGGREGATE';
  end if;

  update public.inventory_batch set quantity_on_hand = quantity_on_hand - 1 where batch_id = v_batch.batch_id and quantity_on_hand >= 1;
  if not found then raise exception 'BATCH_STOCK_CHANGED'; end if;
  v_inventory_batch_id := v_batch.batch_id;
  v_batch_number := v_batch.batch_number;

  update public.inventory set quantity_on_hand = quantity_on_hand - 1, updated_at = now()
  where inventory_id = v_inventory.inventory_id and quantity_on_hand >= 1;
  if not found then raise exception 'INVENTORY_STOCK_CHANGED'; end if;

  insert into public.inventory_transaction (inventory_id, inventory_batch_id, transaction_type, quantity, transaction_date, reference_number, remarks, performed_by)
  values (v_inventory.inventory_id, v_inventory_batch_id, 'STOCK_OUT', 1, now(), 'vaccination_record:' || p_record_id,
          'Dose administered — approved vaccination record ' || p_record_id || ' — batch ' || v_batch_number, v_user_id)
  returning transaction_id into v_transaction_id;

  for v_comp in
    select c.item_id, c.quantity, i.item_name from public.vaccine_companion_item c join public.item i on i.item_id = c.item_id
    where c.vaccine_id = v_record.vaccine_id and c.active and i.status = 'ACTIVE'
  loop
    v_c_tx := null;
    select * into v_c_inv from public.inventory where barangay_id = v_child.barangay_id and item_id = v_comp.item_id for update;
    if found and coalesce(v_c_inv.quantity_on_hand, 0) >= v_comp.quantity then
      select * into v_c_batch from public.inventory_batch where inventory_id = v_c_inv.inventory_id and quantity_on_hand >= v_comp.quantity
      order by expiry_date asc, batch_id asc limit 1 for update;
      if found then
        update public.inventory_batch set quantity_on_hand = quantity_on_hand - v_comp.quantity where batch_id = v_c_batch.batch_id;
        update public.inventory set quantity_on_hand = quantity_on_hand - v_comp.quantity, updated_at = now() where inventory_id = v_c_inv.inventory_id;
        insert into public.inventory_transaction (inventory_id, inventory_batch_id, transaction_type, quantity, transaction_date, reference_number, remarks, performed_by)
        values (v_c_inv.inventory_id, v_c_batch.batch_id, 'STOCK_OUT', v_comp.quantity, now(), 'vaccination_record:' || p_record_id || ':companion',
                v_comp.item_name || ' given with vaccination record ' || p_record_id || ' — batch ' || v_c_batch.batch_number, v_user_id)
        returning transaction_id into v_c_tx;
      end if;
    end if;
    insert into public.vaccination_record_companion (vaccination_record_id, item_id, quantity, deducted, inventory_transaction_id, note)
    values (p_record_id, v_comp.item_id, v_comp.quantity, v_c_tx is not null, v_c_tx,
            case when v_c_tx is null then 'No stock in the barangay; not deducted' end);
    v_companions := v_companions || jsonb_build_object('item_id', v_comp.item_id, 'item_name', v_comp.item_name, 'quantity', v_comp.quantity, 'deducted', v_c_tx is not null);
  end loop;

  update public.vaccination_record set status = 'APPROVED', approved_by = v_user_id, approved_at = now(), review_remarks = v_remarks
  where vaccination_record_id = p_record_id;
  insert into public.vaccination_record_review_event (vaccination_record_id, action, from_status, to_status, note, actor_id)
  values (p_record_id, 'APPROVED', 'PENDING', 'APPROVED', v_remarks, v_user_id);

  return jsonb_build_object('vaccination_record_id', p_record_id, 'status', 'APPROVED', 'review_remarks', v_remarks,
    'stock_deducted', 1, 'inventory_batch_id', v_inventory_batch_id, 'inventory_transaction_id', v_transaction_id, 'companions', v_companions);
end;
$function$;

-- Resubmit a corrected record (edits are saved first through the normal edit path).
create or replace function public.echims_resubmit_vaccination_record(p_record_id bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  r public.vaccination_record%rowtype;
  c public.child%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_event bigint;
  v_vaccine text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if v_note is not null and length(v_note) > 2000 then raise exception 'The note is too long (2000 characters at most).' using errcode = '22023'; end if;
  select * into r from public.vaccination_record where vaccination_record_id = p_record_id for update;
  if not found then raise exception 'RECORD_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into c from public.child where child_id = r.child_id;
  if not ((r.recorded_by = v_user and (public.is_bhw() or public.is_midwife()) and public.is_assigned_to_barangay(c.barangay_id))
          or public.is_admin()
          or (public.is_phn() and public.is_phn_assigned_to_rhu(c.barangay_id))) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if r.status <> 'NEEDS_CORRECTION' then raise exception 'Only records that need correction can be resubmitted (this one is %).', r.status using errcode = '22023'; end if;

  perform pg_catalog.set_config('echims.vr_workflow', 'on', true);
  update public.vaccination_record set status = 'PENDING', review_remarks = null, approved_by = null, approved_at = null
  where vaccination_record_id = p_record_id;
  insert into public.vaccination_record_review_event (vaccination_record_id, action, from_status, to_status, note, actor_id)
  values (p_record_id, 'RESUBMITTED', 'NEEDS_CORRECTION', 'PENDING', v_note, v_user) returning event_id into v_event;

  -- Tell the PHNs of the child's RHU that it is back for approval.
  select coalesce(v.vaccine_type, 'vaccine') into v_vaccine from public.vaccine v where v.vaccine_id = r.vaccine_id;
  insert into public.alert (alert_type, alert_message, severity, status, rule_id, child_id, recipient_id, actor_id, source_module, event_key)
  select 'NIP_RECORD_RESUBMITTED',
    pg_catalog.format('Corrected vaccination record awaiting approval: %s, %s dose %s.%s',
      pg_catalog.concat_ws(' ', c.first_name, c.middle_name, c.last_name), v_vaccine, r.dose_number,
      case when v_note is null then '' else ' Note: ' || left(v_note, 300) end),
    'MEDIUM', 'UNREAD', ar.rule_id, r.child_id, phn.user_id, v_user, 'VACCINATION_RECORD', 'VR_REVIEW:' || v_event
  from public.public_health_nurse phn
  join public.barangay b on b.rhu_id = phn.rhu_id
  join public.users u on u.user_id = phn.user_id
  cross join public.alert_rule ar
  where b.barangay_id = c.barangay_id and u.account_status = 'ACTIVE'
    and ar.rule_name = 'NIP_RECORD_REVIEW' and ar.status = 'ACTIVE'
  on conflict (recipient_id, event_key) where recipient_id is not null and event_key is not null do nothing;

  return jsonb_build_object('vaccination_record_id', p_record_id, 'status', 'PENDING', 'event_id', v_event);
end;
$function$;
revoke all on function public.echims_resubmit_vaccination_record(bigint, text) from public, anon;
grant execute on function public.echims_resubmit_vaccination_record(bigint, text) to authenticated;
