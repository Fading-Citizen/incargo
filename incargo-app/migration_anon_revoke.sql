-- Supabase default table privileges can grant anon access even when RLS denies rows.
revoke all on public.incargo_memberships,public.incargo_trips,public.incargo_deliveries,public.incargo_delivery_events,public.incargo_delivery_proofs from anon;
