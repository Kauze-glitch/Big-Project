# ZYRO API deployment note

Project: `grhdawkxnrkgkahegnnd`  
Function: `zyro-api`  
Production version at this update: **15 (ACTIVE)**  
`verify_jwt`: `false` (the function performs its own Basic Auth check for admin routes).

## Decision email workflow

- `POST /registrations/:id/decision` handles one applicant at a time.
- Approval uses the editable approval template; rejection supports the saved template with a per-applicant `{{reason}}` or a one-off custom subject/body.
- A decision can be saved without sending an email.
- Resend must return a message ID before the API reports a confirmed send.
- `public.zyro_decision_email_outbox` stores the request fingerprint, registration ID, decision, delivery state and provider message ID. It does not store recipient email addresses or rendered email content.
- RLS is enabled. Only `service_role` has `SELECT`, `INSERT` and `UPDATE` privileges on the outbox table; `anon` and `authenticated` have none.
- If Resend accepts a message but the registration update fails, repeating the same request reuses the saved outbox record and skips the send. A pending request older than 23 hours is marked `uncertain` and blocked from automatic resend to stay inside Resend's 24-hour idempotency window.

## Required Supabase Function Secrets

- `RESEND_API_KEY` — Resend API key.
- `EMAIL_FROM` — sender address on a verified Resend domain.
- `EMAIL_REPLY_TO` — optional reply address.
- `PUBLIC_SITE_URL` — optional public site URL used by the logo fallback.

Do not send email to real applicants until the Resend domain and secrets are verified. The current production configuration has not been confirmed by a delivery test; no test email has been sent as part of this work.

## Source and authentication handling

The production Edge Function is deployed independently through Supabase. Its current source contains an embedded admin password hash, so do not copy `index.ts` into GitHub yet. Before versioning the function source, move that hash to a Supabase Function Secret named `ADMIN_PASSWORD_SHA256` and update the function to read it while preserving the existing Basic Auth behavior. Never commit the hash, API keys or passwords.

`DELETE-ROUTE.patch` is retained as a historical patch artifact. The DELETE route is already present in the active function; do not apply the patch again.