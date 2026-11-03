# ZYRO API deployment note

Project: `grhdawkxnrkgkahegnnd`  
Function: `zyro-api`  
`verify_jwt`: `false`; the function validates the existing Admin Basic Auth on protected routes. The public health check does not require an extra server secret.

## Decision email workflow

- `POST /registrations/:id/decision` handles one applicant at a time.
- Approval uses the editable approval template; rejection supports the saved template with a per-applicant `{{reason}}` or a one-off custom subject/body.
- A decision can be saved without sending an email.
- Email content is rendered and sanitized in this Edge Function, then sent to the Render mailer endpoint, which forwards it to Google Apps Script over HTTPS.
- Google Apps Script uses `MailApp.sendEmail`; it returns no Gmail message ID, so the relay returns an internal receipt ID after Google accepts the call. This receipt is not a guarantee of inbox delivery.
- `public.zyro_decision_email_outbox` stores only the idempotency key, registration ID, decision, delivery state and internal receipt ID. It does not store recipient addresses or rendered email content.
- RLS is enabled. Only `service_role` has `SELECT`, `INSERT` and `UPDATE` privileges on the outbox table; `anon` and `authenticated` have none.
- If Google accepts a message but the registration update fails, repeating the same request reuses the saved outbox record and skips the send. A pending request older than 23 hours is marked `uncertain` and blocked from automatic resend. The Apps Script additionally persists hashed idempotency keys and send states in Script Properties.

## Required Render environment variables

- `ZYRO_API_URL` — this Supabase function URL.
- `MAILER_WEB_APP_URL` — deployed Apps Script Web App URL ending in `/exec`.
- `MAILER_SHARED_SECRET` — same random secret stored in Apps Script Script Properties as `ZYRO_MAILER_SECRET`.

The Apps Script must execute as the deploying Gmail account and allow anonymous web-app access. Keep `MAILER_SHARED_SECRET` only in Render and Apps Script Script Properties. Never commit it or expose it in browser JavaScript.

## Source and authentication handling

The production Edge Function is deployed independently through Supabase. Its current source contains an embedded admin password hash. Never publish credentials, API keys, passwords or shared secrets. Preserve the existing Basic Auth behavior when updating the function.

`DELETE-ROUTE.patch` is retained as a historical patch artifact. The DELETE route is already present in the active function; do not apply the patch again.
