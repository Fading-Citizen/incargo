-- BORRADOR DE DISEÑO. No aplicar a Supabase hasta revisar fuentes y permisos.
-- Sin GRANT, policies, Storage ni usuarios: la exposición se diseña por separado.
create table public.incargo_trips (
  id uuid primary key default gen_random_uuid(),
  source_system text,
  source_id text,
  route_label text not null,
  scheduled_date date not null,
  vehicle_plate text,
  driver_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (source_system, source_id),
  check ((source_system is null) = (source_id is null))
);

create table public.incargo_deliveries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.incargo_trips(id),
  source_system text,
  source_id text,
  customer_name text not null,
  destination_text text,
  invoice_reference text,
  remittance_reference text,
  current_status text not null default 'pending'
    check (current_status in ('pending', 'in_transit', 'at_delivery', 'delivered', 'exception')),
  created_at timestamptz not null default now(),
  unique (source_system, source_id),
  check ((source_system is null) = (source_id is null))
);

create table public.incargo_delivery_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.incargo_deliveries(id),
  event_type text not null,
  note text,
  actor_user_id uuid references auth.users(id),
  occurred_at timestamptz not null default now()
);

create table public.incargo_delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.incargo_deliveries(id),
  private_object_path text not null,
  receiver_name text not null,
  observation text,
  captured_by uuid references auth.users(id),
  captured_at timestamptz not null default now()
);

-- RLS will be enabled with reviewed policies before any table is exposed.
