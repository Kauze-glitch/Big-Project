# ZYRO Volleyball Club Form

Mobile-first registration form for ZYRO Volleyball Club. It replaces Google Forms with a branded public form, stores submissions in PostgreSQL on Render, and includes a password-protected admin page.

## Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`. Without `DATABASE_URL`, submissions are stored locally in `.data/registrations.json` for development.

Admin: `http://localhost:3000/admin`. By default local credentials are `zyro` / `change-me`; set `ADMIN_USER` and `ADMIN_PASSWORD` before sharing the app.

Production startup fails if `DATABASE_URL` or a non-default `ADMIN_PASSWORD` is missing, so a deployed instance cannot silently fall back to ephemeral storage or the development password.

## Render

The included `render.yaml` defines one Node web service and one Render Postgres database in Singapore. Create a Blueprint from the repository and set the prompted `ADMIN_USER` and `ADMIN_PASSWORD` values. Render injects `DATABASE_URL` automatically.

The Blueprint currently uses Render's Free plan for both resources so it is easy to preview. Render's Free Postgres databases expire after 30 days, so switch the database to a paid plan before relying on it for long-term member records.

Public form fields:
- Zalo name
- Expected participation duration
- Gender, volleyball position, current level
- Goal when joining a match

After submission, the success screen links directly to Zalo for Anh Nguyễn (0836 000 190) and Long (0364 964 897).

The public page uses two generic volleyball photographs as atmosphere only; they are not presented as ZYRO members or events. Credits and licence links are included in the footer.
