-- NIP-REV01 · "Missed", not "Overdue", in new vaccination alerts. Built on the live definition
-- (backup.nip_rev01_functions). Past alert text is left as raised (guard_targeted_alert_update
-- protects it; backup.nip_rev01_alert_messages holds the 102 affected messages for reference).
do $$ declare d text; begin
  d := pg_get_functiondef('public.run_alert_vaccination_monitoring'::regproc);
  if strpos(d, 'Vaccination overdue: %s. Review the child record for missing doses and follow-up.') = 0 then raise exception 'UNEXPECTED_DEFINITION'; end if;
  execute replace(d, 'Vaccination overdue: %s. Review the child record for missing doses and follow-up.', 'Missed vaccination: %s. Review the child record for missed doses and follow-up.');
end $$;
