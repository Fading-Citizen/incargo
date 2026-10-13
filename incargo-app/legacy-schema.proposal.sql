-- PROPOSAL ONLY: not applied. Requires approval of data access, retention,
-- private Storage policy, and exact reconciliation of legacy workbook.
create schema incargo_legacy;
revoke all on schema incargo_legacy from public, anon, authenticated;

create table incargo_legacy.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  spreadsheet_id text not null,
  sheet_gid bigint not null,
  captured_at timestamptz not null,
  source_timezone text not null default 'America/Bogota',
  export_sha256 text not null check (length(export_sha256)=64),
  source_rows integer not null check (source_rows>=0),
  unique(spreadsheet_id,sheet_gid,export_sha256)
);

create table incargo_legacy.inspections (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references incargo_legacy.source_snapshots(id),
  source_row integer not null check (source_row>=1),
  row_sha256 text not null check (length(row_sha256)=64),
  layout text not null check (layout in ('legacy_14','legacy_18','current_19','headered')),
  timestamp_raw text,
  fecha_raw text,
  ciudad text,
  placa text,
  conductor text,
  licencia text,
  empresa text,
  clase_vehiculo text,
  tipo_carroceria text,
  placa_semirremolque text,
  modelo text,
  gps_documental text,
  tarjeta_propiedad text,
  soat_raw text,
  tecnomecanica_raw text,
  tipo_transporte_raw text,
  items_json jsonb,
  unique(snapshot_id,source_row)
);

create table incargo_legacy.affiliations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references incargo_legacy.source_snapshots(id),
  source_row integer not null check (source_row>=2),
  row_sha256 text not null check (length(row_sha256)=64),
  timestamp_raw text,
  correo_registro text,
  tipo_vinculacion_raw text,
  tipo_vinculacion_otro text,
  nombre_completo text,
  tipo_identificacion text,
  numero_identificacion text,
  correo_electronico text,
  acepta_contrato_raw text,
  aceptado_en_raw text,
  version_contrato_raw text,
  unique(snapshot_id,source_row)
);

create table incargo_legacy.evidence (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid references incargo_legacy.inspections(id),
  affiliation_id uuid references incargo_legacy.affiliations(id),
  source_cell text not null,
  evidence_kind text not null check (evidence_kind in ('signature','photo')),
  status text not null check (status in ('complete','truncated','missing','unreadable')),
  private_object_path text,
  source_sha256 text,
  check ((inspection_id is null) <> (affiliation_id is null)),
  check ((status='complete')=(private_object_path is not null))
);

alter table incargo_legacy.source_snapshots enable row level security;
alter table incargo_legacy.inspections enable row level security;
alter table incargo_legacy.affiliations enable row level security;
alter table incargo_legacy.evidence enable row level security;
-- No grants or policies until the authorized audience and retention are approved.
