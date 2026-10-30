-- Closed model proposal, NOT a migration/activation. No RPC, imports or app grants.
begin;
create table incargo_enterprise.suppliers (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check(length(btrim(display_name)) between 1 and 200),
 source_reference text not null check(length(btrim(source_reference)) between 4 and 500),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
-- A cost records an evidenced amount, not an approved payment or a tariff.
-- Exactly one attribution avoids counting the full cost against a trip AND its order.
create table incargo_enterprise.cost_records (
 id uuid primary key default gen_random_uuid(),
 supplier_id uuid not null references incargo_enterprise.suppliers(id),
 trip_id uuid references public.incargo_trips(id),order_id uuid references incargo_enterprise.orders(id),
 description text not null check(length(btrim(description)) between 4 and 1000),
 currency text not null check(currency~'^[A-Z]{3}$'),
 documented_amount numeric not null check(documented_amount>0 and documented_amount<1000000000000 and scale(documented_amount)<=2),
 incurred_date date not null,
 source_reference text not null check(length(btrim(source_reference)) between 4 and 500),
 external_reference text not null check(length(btrim(external_reference)) between 1 and 120),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(num_nonnulls(trip_id,order_id)=1),unique(supplier_id,external_reference)
);
create index cost_records_trip on incargo_enterprise.cost_records(trip_id);
create index cost_records_order on incargo_enterprise.cost_records(order_id);
-- Do not infer this canonical vehicle catalogue from free-text plates in historical trips.
create table incargo_enterprise.vehicles (
 id uuid primary key default gen_random_uuid(),
 registration_reference text not null unique check(length(btrim(registration_reference)) between 1 and 120),
 plate_display text not null check(length(btrim(plate_display)) between 1 and 40),
 source_reference text not null check(length(btrim(source_reference)) between 4 and 500),
 verified_by uuid not null references auth.users(id),verified_at timestamptz not null default now()
);
-- Immutable provenance metadata: payloads/files stay at their existing protected source.
create table incargo_enterprise.source_evidence (
 id uuid primary key default gen_random_uuid(),
 source_system text not null check(source_system in ('checklist','vinculacion','quote_request')),
 source_record_key text not null check(length(btrim(source_record_key)) between 1 and 200),
 source_revision text not null check(length(btrim(source_revision)) between 1 and 200),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 source_reference text not null check(length(btrim(source_reference)) between 4 and 500),
 captured_at timestamptz not null,
 recorded_by uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 unique(source_system,source_record_key,source_revision)
);
-- No retention periods, compliance status or verified availability inferred.
create table incargo_enterprise.vehicle_documents (
 id uuid primary key default gen_random_uuid(),vehicle_id uuid not null references incargo_enterprise.vehicles(id),
 source_evidence_id uuid not null references incargo_enterprise.source_evidence(id),
 document_label text not null check(length(btrim(document_label)) between 1 and 200),
 reported_expiry_date date,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(vehicle_id,source_evidence_id,document_label)
);
do $$declare t text;begin foreach t in array array['suppliers','cost_records','vehicles','source_evidence','vehicle_documents'] loop
 execute format('alter table incargo_enterprise.%I enable row level security',t);
 execute format('revoke all on incargo_enterprise.%I from public,anon,authenticated',t);
end loop;end$$;
commit;
