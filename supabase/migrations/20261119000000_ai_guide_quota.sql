-- Quota for the portal voice assistant (gemini-assistant operation "guide").
-- Separate from ai_usage so citizen questions never consume member quota.
begin;
create table if not exists public.ai_guide_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null,
  minute_count integer not null default 0,
  day_start date not null,
  day_count integer not null default 0
);
alter table public.ai_guide_usage enable row level security;
revoke all on public.ai_guide_usage from public, anon, authenticated;

-- Called only by the Edge Function after it has verified the caller is an
-- OTP-verified citizen or a project member: 5 questions/minute, 40/day.
create or replace function public.reserve_ai_guide_request(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare
  request_time timestamptz := clock_timestamp();
  current_day date := (request_time at time zone 'Asia/Ho_Chi_Minh')::date;
  usage_row public.ai_guide_usage%rowtype;
begin
  insert into public.ai_guide_usage(user_id,minute_start,day_start)
    values(p_user_id,request_time,current_day) on conflict do nothing;
  select * into usage_row from public.ai_guide_usage where user_id=p_user_id for update;
  if usage_row.minute_start <= request_time - interval '1 minute' then
    usage_row.minute_start := request_time; usage_row.minute_count := 0;
  end if;
  if usage_row.day_start <> current_day then
    usage_row.day_start := current_day; usage_row.day_count := 0;
  end if;
  if usage_row.minute_count >= 5 or usage_row.day_count >= 40 then return false; end if;
  update public.ai_guide_usage set minute_start=usage_row.minute_start,
    minute_count=usage_row.minute_count+1, day_start=usage_row.day_start,
    day_count=usage_row.day_count+1 where user_id=p_user_id;
  return true;
end;
$$;
revoke all on function public.reserve_ai_guide_request(uuid) from public,anon,authenticated;
grant execute on function public.reserve_ai_guide_request(uuid) to service_role;
commit;
