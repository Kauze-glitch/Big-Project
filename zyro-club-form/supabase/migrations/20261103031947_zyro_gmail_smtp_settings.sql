create table if not exists public.zyro_email_settings (
  id text primary key default 'main'
    check (id = 'main'),
  sender_email text not null,
  encrypted_app_password jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.zyro_email_settings
  enable row level security;

revoke all on table public.zyro_email_settings
  from anon, authenticated;

grant all on table public.zyro_email_settings
  to service_role;
