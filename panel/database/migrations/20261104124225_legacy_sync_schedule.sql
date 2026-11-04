-- Independent five-minute jobs; no JWT, service key, Vault secret or external
-- scheduler. Existing memberships are untouched. Both workers use fixed GETs.
select cron.schedule('incargo-legacy-inspections-sync','*/5 * * * *',$job$select incargo_admin.sync_legacy('inspections');$job$);
select cron.schedule('incargo-legacy-affiliations-sync','2-59/5 * * * *',$job$select incargo_admin.sync_legacy('affiliations');$job$);
