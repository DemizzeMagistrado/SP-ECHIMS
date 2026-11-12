-- NIP-REV01 · Vaccination revisions (QA RHU Daet + panel).
-- Backup: backup.nip_rev01_vaccine, backup.nip_rev01_item, backup.nip_rev01_batch_numbers,
--         backup.nip_rev01_functions (taken before this migration).

-- 1. Catalog ---------------------------------------------------------------------------------
-- Hep-B display name (code stays HEPB; every lookup strips '-' before comparing).
update public.vaccine set vaccine_type = 'Hep-B', updated_at = now() where vaccine_type = 'HEPB';

-- Rotavirus: RHU does not offer it. Deactivate, never delete (old records keep their vaccine).
update public.item set status = 'INACTIVE' where item_id = (select vaccine_id from public.vaccine where vaccine_type = 'ROTA');

-- MR (Measles-Rubella), also used for campaign doses.
with i as (
  insert into public.item (item_name, description, unit, status)
  select 'MR Vaccine', 'Measles-Rubella vaccine (routine catch-up and campaign doses)', 'dose', 'ACTIVE'
  where not exists (select 1 from public.vaccine where vaccine_type = 'MR')
  returning item_id
)
insert into public.vaccine (vaccine_id, vaccine_type, dose_volume, route, target_age, min_age_days, interval_days, total_doses, updated_at)
select item_id, 'MR', '0.5 mL', 'Subcutaneous', '9 months and older (campaign / supplemental dose)', 270, null, 1, now() from i;

-- Companion medication item.
insert into public.item (item_name, description, unit, status)
select 'Paracetamol Drops', 'Given with Pentavalent doses (companion medication).', 'bottle', 'ACTIVE'
where not exists (select 1 from public.item where item_name = 'Paracetamol Drops');

-- 2. Companion medications per vaccine (configurable) -----------------------------------------
create table if not exists public.vaccine_companion_item (
  vaccine_id bigint not null references public.vaccine(vaccine_id),
  item_id bigint not null references public.item(item_id),
  quantity numeric not null default 1 check (quantity > 0),
  note text,
  active boolean not null default true,
  primary key (vaccine_id, item_id)
);
alter table public.vaccine_companion_item enable row level security;
create policy vci_select on public.vaccine_companion_item for select to authenticated using (true);
create policy vci_admin on public.vaccine_companion_item for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.vaccine_companion_item (vaccine_id, item_id, quantity, note)
select v.vaccine_id, i.item_id, 1, 'Paracetamol drops will be recorded with this dose'
from public.vaccine v, public.item i
where v.vaccine_type = 'PENTA' and i.item_name = 'Paracetamol Drops'
on conflict do nothing;

-- What was actually given with each approved record (written only by the review RPC).
create table if not exists public.vaccination_record_companion (
  vaccination_record_id bigint not null references public.vaccination_record(vaccination_record_id),
  item_id bigint not null references public.item(item_id),
  quantity numeric not null check (quantity > 0),
  deducted boolean not null,
  inventory_transaction_id bigint references public.inventory_transaction(transaction_id),
  note text,
  created_at timestamptz not null default now(),
  primary key (vaccination_record_id, item_id)
);
alter table public.vaccination_record_companion enable row level security;
-- Visible when the parent record is visible (vaccination_record RLS applies inside EXISTS).
create policy vrc_select on public.vaccination_record_companion for select to authenticated
  using (exists (select 1 from public.vaccination_record r where r.vaccination_record_id = vaccination_record_companion.vaccination_record_id));

-- 3. BHW-to-assist flag (per child; shown on Schedule and Defaulters) ------------------------
create table if not exists public.child_vaccination_assist (
  child_id bigint primary key references public.child(child_id),
  reason text check (reason is null or length(reason) <= 300),
  flagged_by uuid not null default auth.uid() references public.users(user_id),
  flagged_at timestamptz not null default now()
);
alter table public.child_vaccination_assist enable row level security;
-- Child RLS inside EXISTS keeps it to the worker's barangay / PHN's RHU / admin.
create policy cva_all on public.child_vaccination_assist for all to authenticated
  using ((public.is_admin() or public.is_phn() or public.is_bhw() or public.is_midwife())
         and exists (select 1 from public.child c where c.child_id = child_vaccination_assist.child_id))
  with check ((public.is_admin() or public.is_phn() or public.is_bhw() or public.is_midwife())
         and exists (select 1 from public.child c where c.child_id = child_vaccination_assist.child_id));

-- 4. Schedules cannot be rejected ------------------------------------------------------------
create or replace function public.nip_block_vaccination_schedule_reject()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.activity_type = 'VACCINATION' and new.child_id is not null and new.status = 'REJECTED'
     and (tg_op = 'INSERT' or old.status is distinct from 'REJECTED') then
    raise exception 'Vaccination schedules cannot be rejected. Approve it or ask for a new date.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists nip_block_vaccination_schedule_reject on public.health_activity_schedule;
create trigger nip_block_vaccination_schedule_reject before insert or update of status on public.health_activity_schedule
  for each row execute function public.nip_block_vaccination_schedule_reject();

-- 5. Batch numbers: one canonical form everywhere ---------------------------------------------
-- Same rule as lib/vaccination-config.ts normalizeBatchNumber (trim, uppercase, spaces -> '-').
create or replace function public.echims_normalize_batch(p text) returns text
language sql immutable set search_path to '' as $$
  select nullif(pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.upper(pg_catalog.btrim(p)), '\s+', '-', 'g'), '-{2,}', '-', 'g'), '')
$$;
update public.vaccination_record set batch_number = public.echims_normalize_batch(batch_number) where batch_number is distinct from public.echims_normalize_batch(batch_number);
update public.inventory_batch set batch_number = public.echims_normalize_batch(batch_number) where batch_number is distinct from public.echims_normalize_batch(batch_number);
update public.stock_request set batch_number = public.echims_normalize_batch(batch_number) where batch_number is distinct from public.echims_normalize_batch(batch_number);
update public.supplementation_record set batch_number = public.echims_normalize_batch(batch_number) where batch_number is distinct from public.echims_normalize_batch(batch_number);
-- Reject non-canonical values loudly (APIs normalize first) instead of letting lookups miss.
alter table public.vaccination_record add constraint vaccination_record_batch_canonical check (batch_number is null or batch_number = public.echims_normalize_batch(batch_number));
alter table public.inventory_batch add constraint inventory_batch_batch_canonical check (batch_number is null or batch_number = public.echims_normalize_batch(batch_number));
alter table public.stock_request add constraint stock_request_batch_canonical check (batch_number is null or batch_number = public.echims_normalize_batch(batch_number));
alter table public.supplementation_record add constraint supplementation_record_batch_canonical check (batch_number is null or batch_number = public.echims_normalize_batch(batch_number));

-- 6. Review RPC: also dispense companion medications on approval ------------------------------
-- Based on the live definition (backup.nip_rev01_functions). Companion stock never blocks the
-- vaccine approval: without stock it is logged as not deducted so the PHN can follow up.
create or replace function public.msp_review_vaccination_record(p_record_id bigint, p_action text, p_review_remarks text default null)
returns jsonb language plpgsql security definer set search_path to '' as $function$
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
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_action not in ('APPROVE', 'REJECT') then raise exception 'INVALID_ACTION'; end if;

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

  if v_action = 'REJECT' then
    update public.vaccination_record set status = 'REJECTED', approved_by = v_user_id, approved_at = now(), review_remarks = v_remarks
    where vaccination_record_id = p_record_id;
    return jsonb_build_object('vaccination_record_id', p_record_id, 'status', 'REJECTED', 'review_remarks', v_remarks,
      'stock_deducted', 0, 'inventory_batch_id', null, 'inventory_transaction_id', null, 'companions', '[]'::jsonb);
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

  -- Companion medications (e.g. Paracetamol Drops with Pentavalent), same barangay stock, FEFO.
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

  return jsonb_build_object('vaccination_record_id', p_record_id, 'status', 'APPROVED', 'review_remarks', v_remarks,
    'stock_deducted', 1, 'inventory_batch_id', v_inventory_batch_id, 'inventory_transaction_id', v_transaction_id, 'companions', v_companions);
end;
$function$;
