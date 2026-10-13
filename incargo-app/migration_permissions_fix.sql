-- Supabase default privileges may grant EXECUTE directly to anon/authenticated.
revoke execute on function public.incargo_record_issue(uuid,uuid,text), public.incargo_confirm_delivery(uuid,uuid,text,text,text), public.incargo_create_tracking_link(uuid,int), public.incargo_revoke_tracking_link(text), public.incargo_read_tracking(text) from public, anon, authenticated;
revoke execute on function incargo_private.is_operations(), incargo_private.is_assigned(uuid) from public, anon, authenticated;
grant execute on function public.incargo_record_issue(uuid,uuid,text), public.incargo_confirm_delivery(uuid,uuid,text,text,text), public.incargo_create_tracking_link(uuid,int), public.incargo_revoke_tracking_link(text) to authenticated;
grant execute on function public.incargo_read_tracking(text) to service_role;
grant execute on function incargo_private.is_operations(), incargo_private.is_assigned(uuid) to authenticated;
