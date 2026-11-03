# ZYRO Google Apps Script Mail Relay

This small Google Apps Script web app sends ZYRO approval/rejection and test emails through the Gmail account that deploys the script. Render calls it over HTTPS; it does not use SMTP, an App Password, or a paid Render instance.

## 1. Create the Apps Script project

1. Sign in to the Gmail account that should send ZYRO emails.
2. Open <https://script.google.com/home/start> and create a new project named `ZYRO Mail Relay`.
3. Replace the default `Code.gs` with this folder's `Code.gs`.
4. In **Project Settings**, enable **Show `appsscript.json` manifest file in editor**. Open the manifest and replace it with this folder's `appsscript.json`.
5. Save the project.

## 2. Create the shared secret and authorize MailApp

1. In the function selector, choose `setupZyroMailerSecret` and click **Run** once.
2. Approve Google's authorization prompt. This creates a random secret in Script Properties and prints it in the execution log. Copy the value after `MAILER_SHARED_SECRET=`. Do not put it in GitHub, the website, or a chat message.
3. Choose `authorizeZyroMailer` and click **Run**. Approve the email-sending permission. The function logs the Gmail account and current remaining recipient quota.
4. In **Project Settings → Script Properties**, confirm that `ZYRO_MAILER_SECRET` exists. Do not share or delete it.

If `setupZyroMailerSecret` says a secret already exists, do not run `rotateZyroMailerSecret` unless you intend to update Render's secret at the same time. Rotating only one side will temporarily disconnect the mail relay.

## 3. Deploy as a web app

1. Click **Deploy → New deployment**.
2. Select type **Web app**.
3. Set **Execute as** to **Me** (the account that owns/deploys this script).
4. Set **Who has access** to **Anyone, even anonymous**. The endpoint is protected by the long random shared secret; Render sends that secret server-to-server. It is never included in the public website or Admin JavaScript.
5. Click **Deploy**, authorize if prompted, and copy the web app URL ending in `/exec` (not the `/dev` test URL).

If the Google Workspace administrator does not allow anonymous web apps, the deployment cannot be called by Render without a Google login. Ask the Workspace administrator to allow this deployment type or use a different Gmail account that permits it.

## 4. Configure Render

In Render → `zyro-club-form` → **Environment**, add these two variables:

- `MAILER_WEB_APP_URL` = the Apps Script web app URL ending in `/exec`.
- `MAILER_SHARED_SECRET` = the secret copied from the `setupZyroMailerSecret` execution log.

Keep the existing `ZYRO_API_URL` and `ZYRO_EDGE_SECRET` variables. Do not add the shared secret to any `VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, or browser-side variable. Save changes and let Render redeploy.

## 5. Test from ZYRO Admin

1. Open the ZYRO Admin page and sign in.
2. Open **Giao diện & nội dung → Gửi email miễn phí qua Google**.
3. Click **Kiểm tra kết nối**. The page should show the Gmail account that deployed the Apps Script and the remaining daily recipient quota.
4. Enter an email address you control and click **Gửi email thử**. Check Inbox and Spam.
5. Only after the test email arrives, test one approval/rejection email using an address you control.

## Notes and safeguards

- The script uses `MailApp.sendEmail`; it does not read the Gmail inbox.
- `MailApp.sendEmail` returns no Gmail message ID. The relay therefore returns a stable internal receipt ID after Google accepts the call; it is not a guarantee that the recipient's inbox has received the email. Check Gmail **Sent** and the recipient's Spam folder when diagnosing delivery.
- The script checks `MailApp.getRemainingDailyQuota()` before sending. Google's published quota for consumer Gmail accounts is currently 100 recipients/day; Google Workspace accounts have different limits. The quota is per account, resets 24 hours after the first request, and can change. ZYRO Admin displays the live remaining quota returned by Google.
- The Apps Script stores only hashed idempotency keys and send states in Script Properties, not email bodies or recipient addresses. A retry with the same key reuses the receipt or blocks an uncertain send to reduce duplicate emails.
- Keep the Apps Script project private to trusted maintainers. Anyone who can edit the script can potentially change the mail relay code.
- To deploy a later code update, save the Apps Script project, open **Deploy → Manage deployments → Edit**, choose **New version**, and deploy. The `/exec` URL normally remains the same when editing the existing deployment.
- No App Password, SMTP port, paid Render plan, or third-party email provider is required.

Official Google documentation:

- <https://developers.google.com/apps-script/guides/web>
- <https://developers.google.com/apps-script/reference/mail/mail-app>
- <https://developers.google.com/apps-script/guides/services/quotas>
