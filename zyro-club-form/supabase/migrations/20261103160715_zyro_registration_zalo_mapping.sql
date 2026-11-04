-- Persist the Zalo identity selected by an administrator for each Form registration.
-- Preview-only states (exact, ambiguous, similar, not found) remain in the Admin UI;
-- only confirmed mappings are stored here.
alter table public.zyro_registrations
  add column if not exists zalo_user_id text,
  add column if not exists zalo_group_id text,
  add column if not exists zalo_connection_id text,
  add column if not exists zalo_mapping_status text not null default 'unmapped',
  add column if not exists zalo_mapped_at timestamptz,
  add column if not exists zalo_mapped_by text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.zyro_registrations'::regclass
      and conname = 'zyro_registrations_zalo_mapping_status_check'
  ) then
    alter table public.zyro_registrations
      add constraint zyro_registrations_zalo_mapping_status_check
      check (zalo_mapping_status in ('unmapped', 'confirmed', 'synced'));
  end if;
end;
$$;

create index if not exists zyro_registrations_zalo_user_id_idx
  on public.zyro_registrations (zalo_user_id)
  where zalo_user_id is not null;

create index if not exists zyro_registrations_zalo_group_idx
  on public.zyro_registrations (zalo_connection_id, zalo_group_id)
  where zalo_group_id is not null;

