-- Server-only runtime configuration lookup for the ZYRO mapping Edge Function.
-- This function is SECURITY INVOKER: service_role already has SELECT on vault.decrypted_secrets.
-- No secret values are stored in this migration.

create or replace function public.get_zyro_mapping_runtime_config()
returns table (name text, value text)
language sql
stable
security invoker
set search_path = ''
as $function$
  select secrets.name::text, secrets.decrypted_secret::text
  from vault.decrypted_secrets as secrets
  where secrets.name in (
    'zyro_draft_api_base_url',
    'zyro_mapping_internal_key'
  );
$function$;

revoke all on function public.get_zyro_mapping_runtime_config() from public;
revoke all on function public.get_zyro_mapping_runtime_config() from anon, authenticated;
grant execute on function public.get_zyro_mapping_runtime_config() to service_role;
