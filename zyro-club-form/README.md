# ZYRO Volleyball Club Form

Mobile-first registration form for ZYRO Volleyball Club. It replaces Google Forms with a branded public form, stores submissions in Supabase Postgres through a private Edge Function, and includes a password-protected admin page.

## Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Admin: `http://localhost:3000/admin.html` (also available at `/admin`). The username defaults to `zyro`; the production password is not stored in the browser or repository, and the Edge Function verifies its SHA-256 hash.

## Render

The current Render workspace has two services on branch `zyro-club-form-deploy`:

- Static site `zyro-volleyball-club`, publishing `zyro-club-form/public` at `https://zyro-volleyball-club.onrender.com`.
- Node Web Service `zyro-club-form`, running the Express server from `zyro-club-form`.

Both services use the existing `Kauze-glitch/Big-Project` repository. Persistent registrations and site configuration live in Supabase, so content edits do not require rebuilding the public site.

Public form fields:
- Zalo name
- Expected participation duration
- Gender, volleyball position, current level
- Goal when joining a match
- Optional email address for an approval or rejection notification

After submission, the success screen renders the admin/contact list from `zyro_site_config` and creates Zalo links from each phone number.

The public page uses the ZYRO club logo as its only image asset; there is no stock volleyball gallery or footer.

## Admin CMS

The site includes `/admin.html`. Admins can review registrations and edit the public site's hero copy, play schedule, club principles, contacts, confirmation copy, and form options. Public content is stored in Supabase `zyro_site_config` and loaded at runtime, so changes such as adding T4/T6 or another deputy contact do not require a code deploy. The Admin UI refreshes data in place, reports async results, and tracks unsaved configuration changes. Registration deletion and individual approval/rejection are handled by the authenticated `zyro-api` Edge Function.

## Approval and rejection email

The Admin settings screen includes editable approval and rejection email templates, HTML formatting, merge fields, brand colors/logo and a live preview. When an admin approves or rejects an individual registration, the decision dialog can send the saved template or a one-off custom message. Rejection-by-template requires a per-applicant reason and the `{{reason}}` merge field. A one-off custom rejection never overwrites the saved template. Bulk actions can only return selected registrations to `new`; approvals and rejections must be handled individually so the admin can review the message.

Email delivery uses Resend from the Supabase Edge Function. Configure these secrets in Supabase Dashboard → Project Settings → Edge Functions → Secrets (never commit them to this repository):

- `RESEND_API_KEY`: Resend API key.
- `EMAIL_FROM`: verified sender, e.g. `ZYRO Volleyball Club <no-reply@your-verified-domain.com>`.
- `EMAIL_REPLY_TO` (optional): monitored reply address.
- `PUBLIC_SITE_URL` (optional): public Render URL, used for the default club logo URL.

Verify the sending domain in Resend before sending to real applicants. Until `RESEND_API_KEY` and `EMAIL_FROM` are configured, the Admin can update a registration without sending an email, while a requested email send returns a clear configuration error and does not change the registration status.

The decision-email outbox is `public.zyro_decision_email_outbox`. It stores only the idempotency key, registration ID, decision, delivery state and Resend message ID; it does not store recipient addresses or rendered email content. RLS is enabled and only `service_role` has table privileges. If Resend accepts an email but saving the registration decision fails, retrying the same request reuses the saved outbox record and does not send the email again. Pending requests older than 23 hours are marked uncertain and are blocked from automatic resend, because Resend retains idempotency keys for 24 hours.

The `zyro-api` Edge Function is deployed independently to Supabase project `grhdawkxnrkgkahegnnd`. Its current admin password hash is embedded in the deployed source; do not copy that credential material into GitHub. Before versioning the Edge Function source, move the hash to a Supabase Function Secret named `ADMIN_PASSWORD_SHA256` and update the function to read that secret without changing the existing Basic-auth behavior.