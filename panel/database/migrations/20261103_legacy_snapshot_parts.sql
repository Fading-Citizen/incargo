-- Bounded transport for source responses larger than the management API body limit.
-- Immutable pieces are assembled into source_snapshots, whose CHECK verifies full SHA-256.
create table incargo_admin.source_snapshot_parts (
 kind text not null check(kind in ('inspections','affiliations')),
 snapshot text not null check(snapshot ~ '^[a-f0-9]{64}$'),
 part integer not null check(part>=0),
 content text not null check(octet_length(content)<=300000),
 primary key(kind,snapshot,part)
);
alter table incargo_admin.source_snapshot_parts enable row level security;
revoke all on incargo_admin.source_snapshot_parts from public,anon,authenticated;
create trigger snapshot_part_immutable before update or delete on incargo_admin.source_snapshot_parts for each row execute function incargo_admin.immutable();
