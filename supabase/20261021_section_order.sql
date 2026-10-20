-- Run once in the Supabase SQL Editor as the project administrator.
begin;
create table if not exists public.section_order (
  id integer primary key check (id = 1),
  slugs text[] not null default '{}',
  version integer not null default 0
);
insert into public.section_order(id,slugs)
select 1,coalesce(array_agg(slug::text order by slug),'{}'::text[]) from public.sections
on conflict (id) do nothing;
alter table public.section_order enable row level security;
revoke all on public.section_order from public, anon, authenticated;
grant select on public.section_order to anon, authenticated;
drop policy if exists section_order_read on public.section_order;
create policy section_order_read on public.section_order for select to anon,authenticated using (true);

-- Only this function may change the shared order. It cannot modify section content.
create or replace function public.reorder_sections(p_slugs text[],p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  current_version integer;
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.sections where owner_id=auth.uid()
  ) then raise exception 'MEMBER_REQUIRED' using errcode='42501'; end if;
  select version into current_version from public.section_order where id=1 for update;
  if current_version is null then raise exception 'ORDER_NOT_CONFIGURED'; end if;
  if p_expected_version is distinct from current_version then raise exception 'ORDER_CONFLICT'; end if;
  if p_slugs is null
    or cardinality(p_slugs) <> (select count(*) from public.sections)
    or cardinality(p_slugs) <> (select count(distinct s) from unnest(p_slugs) s)
    or exists(select 1 from unnest(p_slugs) s where not exists(select 1 from public.sections where slug::text=s))
  then raise exception 'INVALID_SECTION_ORDER'; end if;
  update public.section_order set slugs=p_slugs,version=version+1 where id=1
  returning jsonb_build_object('slugs',slugs,'version',version) into result;
  return result;
end;
$$;
revoke all on function public.reorder_sections(text[],integer) from public,anon;
grant execute on function public.reorder_sections(text[],integer) to authenticated;
commit;
