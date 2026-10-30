# Citizen UI prototype

This is a coursework UI demonstration for the Nhóm 12 coursework. It does not grant project membership, create Supabase users, send Telegram messages or verify identity.

Entry: `portal.html`. Routes: `#/login`, `#/admin`, `#/profile`.

The citizen profile now has four routes: `#/profile/personal`, `#/profile/card`, `#/profile/residence`, and `#/profile/requests`. All routes check the current citizen record and active account before rendering. Missing fields show “Chưa cập nhật”; requests are empty unless attached to that citizen's local record. The card view supports masked/revealed numbers, front/back views and validity states.

The original fictional seed records receive fictional card snapshots on read, including for existing localStorage records. Edited profile values are retained. New records do not receive fabricated card metadata. Members may enter optional personal, residence, household and card fields through the record form. Updating profile values preserves the existing card snapshot; changing card issuance fields creates a replacement snapshot in this local adapter. Full multi-issue card history requires the planned backend.

`database.html` is the member-facing design viewer for the 22-table schema. It uses the same verified report membership as the portal manager, removes the viewer on sign-out, and includes searchable table details, related foreign keys, zoom, and design exports. This is schema documentation, not a live database row browser. Design assets are static files in this public GitHub repository; the member check controls the page UI, not source-code confidentiality.

`member-nav.js` adds a diagram link to the report, section and editor headers only for project members. Existing reports and member authentication use the same accounts and data.

- The citizen tab demonstrates credentials followed by OTP and a read-only profile.
- The member tab and manager route are available only after Supabase Auth validates the report session and the user owns one of the three project sections (phan1, phan2, phan3). Guests and citizen demo sessions cannot open the manager through the UI. Auth failures deny access; signing out closes manager dialogs. Mutations revalidate membership. The existing three member accounts and report login are unchanged.
- The manager supports accent-insensitive search, account and area filters, pagination, create/edit, unique mock CCCD validation, account issue/lock/unlock and a local activity feed.
- All records are fictional. Mock CCCD numbers must start with `000`, mock phone numbers with `000`, and optional emails use `example.invalid`. Do not enter real personal information.
- Active sample account: `000000000001`, password `demo123`, OTP `123456`. Every issued mock account uses the same demo password. This is not a security implementation.
- The mock OTP expires after two minutes, has five attempts and a thirty-second resend cooldown. It is never transmitted.
- Records persist only in this browser under `nhom12-citizen-demo-v1`. The demo session is separate and stored in sessionStorage. Local records are public demo state, not access-controlled data.
- Reset restores the original twelve sample records after confirmation and does not touch Supabase or existing report drafts.

## Later backend integration

`portal-store.js` is the data adapter. The UI currently uses synchronous methods `list`, `get`, `save`, `setAccount`, `checkLogin`, `events`, and `reset`. Connecting an asynchronous server requires updating their callers to await responses and display loading/error states; adding a database alone does not connect it automatically.

Before a real authentication implementation, replace the browser-only manager guard, shared demo password, local citizen session and static OTP completely. Enforce member ownership and citizen identity on the server and database; do not rely on browser routes or localStorage permissions. Send Telegram only to the pre-enrolled number with recipient consent; keep tokens in server Secrets. Only authorize private profile access after the server verifies both authentication steps, with rate limits and one-time challenge consumption. No real provider is connected in this UI release.
