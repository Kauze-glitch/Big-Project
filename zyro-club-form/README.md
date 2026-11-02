# ZYRO Volleyball Club Form

Mobile-first registration form for ZYRO Volleyball Club. It replaces Google Forms with a branded public form, stores submissions in Supabase Postgres through a private Edge Function, and includes a password-protected admin page.

## Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Admin: `http://localhost:3000/admin.html`. The username defaults to `zyro`; the production password is not stored in the browser or repository, and the Edge Function verifies only its SHA-256 hash.

## Render

Production is a Render Static Site. Persistent registrations and site configuration live in Supabase, so content edits do not require rebuilding the static site.

Public form fields:
- Zalo name
- Expected participation duration
- Gender, volleyball position, current level
- Goal when joining a match

After submission, the success screen renders the admin/contact list from `zyro_site_config` and creates Zalo links from each phone number.

The public page uses the ZYRO club logo as its only image asset; there is no stock volleyball gallery or footer.

## Admin CMS

The static site now includes `/admin.html`. Admins can review registrations and edit the public site's hero copy, play schedule, club principles, contacts, confirmation copy, and form options. Public content is stored in Supabase `zyro_site_config` and loaded at runtime, so changes such as adding T4/T6 or another deputy contact do not require a code deploy.

