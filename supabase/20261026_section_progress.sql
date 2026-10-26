-- Adds progress to the existing owner-protected sections table.
begin;
alter table public.sections add column if not exists progress_status text not null default 'drafting';
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.sections'::regclass and conname='sections_progress_status_check') then
    alter table public.sections add constraint sections_progress_status_check
      check(progress_status in ('drafting','review','complete'));
  end if;
end $$;
-- Existing SELECT and owner-only UPDATE RLS policies still apply. No new grants.
commit;
notify pgrst, 'reload schema';
