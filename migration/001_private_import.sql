-- Run as the database owner in the DDStar destination project.
-- Keep the source document path and Firestore REST typed fields for lossless validation.
begin;

create schema if not exists ddstar_import;
revoke all on schema ddstar_import from public, anon, authenticated;

create table if not exists ddstar_import.snapshots (
  id uuid primary key,
  source_project text not null,
  source_database text not null,
  read_time timestamptz not null,
  verified_at timestamptz,
  unique (source_project, source_database, read_time)
);

create table if not exists ddstar_import.documents (
  snapshot_id uuid not null references ddstar_import.snapshots(id),
  document_path text not null,
  source_update_time text not null,
  typed_fields jsonb not null check (jsonb_typeof(typed_fields) = 'object'),
  primary key (snapshot_id, document_path)
);

alter table ddstar_import.snapshots enable row level security;
alter table ddstar_import.documents enable row level security;
revoke all on all tables in schema ddstar_import from public, anon, authenticated;
commit;
