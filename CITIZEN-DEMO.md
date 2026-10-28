# Citizen UI prototype

This is a standalone, public UI demonstration for the Nhóm 12 coursework. It does not grant project membership, create Supabase users, send Telegram messages or verify identity.

Entry: `portal.html`. Routes: `#/login`, `#/admin`, `#/profile`.

- The citizen tab demonstrates credentials followed by OTP and a read-only profile.
- The member tab links to the public manager preview and to the original project website. The existing three member accounts and report login are unchanged.
- The manager supports accent-insensitive search, account and area filters, pagination, create/edit, unique mock CCCD validation, account issue/lock/unlock and a local activity feed.
- All records are fictional. Mock CCCD numbers must start with `000`, mock phone numbers with `000`, and optional emails use `example.invalid`. Do not enter real personal information.
- Active sample account: `000000000001`, password `demo123`, OTP `123456`. Every issued mock account uses the same demo password. This is not a security implementation.
- The mock OTP expires after two minutes, has five attempts and a thirty-second resend cooldown. It is never transmitted.
- Records persist only in this browser under `nhom12-citizen-demo-v1`. The demo session is separate and stored in sessionStorage. Local records are public demo state, not access-controlled data.
- Reset restores the original twelve sample records after confirmation and does not touch Supabase or existing report drafts.

## Later backend integration

`portal-store.js` is the data adapter. The UI currently uses synchronous methods `list`, `get`, `save`, `setAccount`, `checkLogin`, `events`, and `reset`. Connecting an asynchronous server requires updating their callers to await responses and display loading/error states; adding a database alone does not connect it automatically.

Before a real authentication implementation, replace the public admin preview, shared demo password, local session and static OTP completely. Enforce member ownership and citizen identity on the server and database; do not rely on browser routes or localStorage permissions. Send Telegram only to the pre-enrolled number with recipient consent; keep tokens in server Secrets. Only authorize private profile access after the server verifies both authentication steps, with rate limits and one-time challenge consumption. No real provider is connected in this UI release.
