create table if not exists public.zyro_decision_email_outbox (
  idempotency_key text primary key,
  registration_id uuid not null,
  decision_status text not null check (decision_status in ('approved', 'rejected')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'sent', 'uncertain')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.zyro_decision_email_outbox enable row level security;

revoke all on table public.zyro_decision_email_outbox from public, anon, authenticated;
grant select, insert, update on table public.zyro_decision_email_outbox to service_role;