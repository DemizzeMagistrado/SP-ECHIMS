-- NIP-REV01 backend 11 — "Household not assigned" task.
-- A transfer may be accepted with only a destination address (kept, by decision); the child then
-- has no household. echims_assign_child_household links one later. Only for a child with no
-- household; the household must be in the child's barangay; the caller must be an active worker
-- assigned to that barangay, the RHU's PHN, or an Administrator. The child's household column is
-- guarded by echims_guard_household_transfer_fields (changes only from a function owned by the
-- transfer-workflow owner), so this runs as SECURITY DEFINER under the same owner.
-- Backup: not needed (new function only; no data changed by this migration).

create or replace function public.echims_assign_child_household(p_child_id bigint, p_household_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.child%rowtype;
  h public.household%rowtype;
begin
  if auth.uid() is null or not exists (select 1 from public.users u where u.user_id = auth.uid() and u.account_status = 'ACTIVE') then
    raise exception 'An active account is required.' using errcode = '42501';
  end if;
  select * into c from public.child where child_id = p_child_id for update;
  if not found then raise exception 'Child not found.' using errcode = 'P0002'; end if;
  if not (public.is_admin()
          or (public.is_phn() and public.is_phn_assigned_to_rhu(c.barangay_id))
          or ((public.is_bhw() or public.is_midwife()) and public.is_assigned_to_barangay(c.barangay_id))) then
    raise exception 'You are not assigned to this child''s barangay.' using errcode = '42501';
  end if;
  if c.household_id is not null then raise exception 'This child already has a household.' using errcode = '22023'; end if;
  select * into h from public.household where household_id = p_household_id;
  if not found then raise exception 'Household not found.' using errcode = 'P0002'; end if;
  if h.barangay_id is distinct from c.barangay_id then raise exception 'Choose a household in the child''s barangay.' using errcode = '22023'; end if;
  update public.child set household_id = h.household_id, address = coalesce(h.household_address, c.address) where child_id = c.child_id;
  return jsonb_build_object('child_id', c.child_id, 'household_id', h.household_id);
end
$$;
revoke all on function public.echims_assign_child_household(bigint, bigint) from public, anon;
grant execute on function public.echims_assign_child_household(bigint, bigint) to authenticated;
