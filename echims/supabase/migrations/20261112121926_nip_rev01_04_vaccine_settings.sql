-- NIP-REV01 · Settings › Vaccine Catalog: batch number format stored in the database, and
-- PHNs (not only Admins) may manage companion medicines per vaccine.
-- Backup: backup.nip_rev01_policies, backup.nip_rev01_vaccine_companion_item.

create table if not exists public.vaccination_setting (
  key text primary key check (key in ('batch_number_format')),
  value jsonb not null,
  updated_by uuid references public.users(user_id),
  updated_at timestamptz not null default now()
);
alter table public.vaccination_setting enable row level security;
create policy vs_select on public.vaccination_setting for select to authenticated using (true);
create policy vs_write on public.vaccination_setting for all to authenticated
  using (public.is_admin() or public.is_phn()) with check (public.is_admin() or public.is_phn());

-- Same rule as before (lib/vaccination-config DEFAULT_BATCH_RULE).
insert into public.vaccination_setting (key, value)
values ('batch_number_format', '{"min": 2, "max": 30, "separators": "-", "example": "BT-2026-0012"}')
on conflict (key) do nothing;

drop policy if exists vci_admin on public.vaccine_companion_item;
create policy vci_manage on public.vaccine_companion_item for all to authenticated
  using (public.is_admin() or public.is_phn()) with check (public.is_admin() or public.is_phn());
