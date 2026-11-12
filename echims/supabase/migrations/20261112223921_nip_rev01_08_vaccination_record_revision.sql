-- NIP-REV01 backend 08 — concurrent edits on vaccination records.
-- vaccination_record.revision goes up by one on every update. The app sends the revision it
-- loaded (record-edit / record-resubmit); a save against an older revision gets a conflict and
-- the "Keep mine / Keep saved" screen, the same pattern as household.information_revision.
-- Backup: backup_nip_rev01_be.vaccination_record (taken before migration 07).

alter table public.vaccination_record
  add column if not exists revision integer not null default 1 check (revision >= 1);
comment on column public.vaccination_record.revision is 'Edit counter for conflict detection: +1 on every update. Saves send the revision they loaded.';

create or replace function public.echims_bump_vaccination_record_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  return new;
end
$$;
drop trigger if exists echims_bump_vaccination_record_revision on public.vaccination_record;
create trigger echims_bump_vaccination_record_revision before update on public.vaccination_record
  for each row execute function public.echims_bump_vaccination_record_revision();
