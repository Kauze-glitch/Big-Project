import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);

test("decision endpoint declares hasEmail in the decision request scope", async () => {
  const source = await readFile(new URL("supabase/functions/zyro-api/index.ts", root), "utf8");
  const start = source.indexOf('if (req.method === "POST" && decisionMatch)');
  const end = source.indexOf('if (req.method === "PATCH" && registrationMatch)', start);
  assert.notEqual(start, -1, "decision endpoint exists");
  assert.notEqual(end, -1, "decision endpoint has a clear end boundary");
  const decision = source.slice(start, end);
  assert.match(decision, /const body = await req\.json\(\);\s*const hasEmail = Object\.prototype\.hasOwnProperty\.call\(body \?\? \{\}, "email"\);/);
  assert.match(decision, /if \(hasEmail\) update\.email = email \|\| null;/);
});

test("successful decision closes the email composer only after the API confirms success", async () => {
  const source = await readFile(new URL("public/admin.js", root), "utf8");
  const start = source.indexOf("async function submitDecision(event)");
  const end = source.indexOf("function markDirty()", start);
  const submit = source.slice(start, end);
  assert.match(submit, /await api\([\s\S]*?closeEmailComposer\(\);/);
  assert.match(submit, /catch \(error\) \{\s*notify\(error\.message/);
});

test("settings screen exposes a persistent save and revert bar on desktop and mobile", async () => {
  const [html, js, css] = await Promise.all([
    readFile(new URL("public/admin.html", root), "utf8"),
    readFile(new URL("public/admin.js", root), "utf8"),
    readFile(new URL("public/admin.css", root), "utf8"),
  ]);
  assert.match(html, /class="mobile-settings-savebar" data-mobile-settings-savebar/);
  assert.match(html, /data-mobile-save-config disabled>Lưu thay đổi/);
  assert.match(html, /data-mobile-revert-config disabled>Hoàn tác/);
  assert.match(js, /mobileSaveButton\?\.addEventListener\("click", \(\) => saveButton\.click\(\)\)/);
  assert.match(js, /mobileRevertButton\?\.addEventListener\("click", \(\) => revertButton\.click\(\)\)/);
  assert.match(css, /\.mobile-settings-savebar\s*\{[\s\S]*?position: fixed;[\s\S]*?bottom: 0;[\s\S]*?left: 224px;[\s\S]*?display: grid;/);\n  assert.match(css, /@media \(max-width: 900px\)\s*\{[\s\S]*?\.mobile-settings-savebar \{ left: 0;/);\n  assert.doesNotMatch(css, /\.mobile-settings-savebar\s*\{\s*display: none;/);\n  assert.match(html, /data-email-design="tagline" maxlength="120" placeholder="Để trống để ẩn slogan"/);
});

test("email template defaults preserve live editor references and an intentionally empty slogan", async () => {
  const source = await readFile(new URL("public/admin.js", root), "utf8");
  const defaults = source.match(/const defaultEmailTemplates = \{[\\s\\S]*?\\n\};/);
  const ensure = source.match(/function ensureEmailTemplates\(config\) \{[\\s\\S]*?\\n\}\n\nfunction authHeaders/);
  assert.ok(defaults, "email defaults are present");
  assert.ok(ensure, "email template initializer is present");
  const ensureSource = ensure[0].replace(/\n\nfunction authHeaders$/, "");
  const initialize = runInNewContext(`${defaults[0]}\n${ensureSource}\nensureEmailTemplates`);

  const config = {
    emailTemplates: {
      design: { tagline: "PLAY TOGETHER. GROW TOGETHER." },
      approved: { title: "Approved" },
      rejected: { title: "Rejected" },
    },
  };
  const templatesRef = config.emailTemplates;
  const designRef = config.emailTemplates.design;
  initialize(config);
  assert.strictEqual(config.emailTemplates, templatesRef);
  assert.strictEqual(config.emailTemplates.design, designRef);

  config.emailTemplates.design.tagline = "";
  initialize(config);
  assert.equal(config.emailTemplates.design.tagline, "");
  assert.strictEqual(config.emailTemplates, templatesRef);
  assert.strictEqual(config.emailTemplates.design, designRef);
});

test("email editor input handlers always update the current config object", async () => {
  const source = await readFile(new URL("public/admin.js", root), "utf8");
  assert.match(source, /const currentTemplate = state\.config\?\.emailTemplates\?\.\[state\.emailTemplateKey\]/);
  assert.match(source, /const currentDesign = state\.config\?\.emailTemplates\?\.design/);
  assert.doesNotMatch(source, /templates\.design\[key\] = input\.value/);
});

test("a retry after a confirmed send reuses the sent outbox receipt instead of sending again", async () => {
  const source = await readFile(new URL("supabase/functions/zyro-api/index.ts", root), "utf8");
  assert.match(source, /if \(outbox\.delivery_status === "sent"\)[\s\S]*?providerMessageId = outbox\.provider_message_id;[\s\S]*?emailSent = true;/);
  assert.match(source, /const idempotencyKey = "zyro-" \+ await sha256/);
});

test("an intentionally empty email slogan stays empty in storage and preview", async () => {
  const [edge, admin] = await Promise.all([
    readFile(new URL("supabase/functions/zyro-api/index.ts", root), "utf8"),
    readFile(new URL("public/admin.js", root), "utf8"),
  ]);
  assert.match(edge, /tagline: typeof designInput\\.tagline === "string"\\s*\\?\\s*text\\(designInput\\.tagline, 120\\)\\s*:\\s*DEFAULT_EMAIL_TEMPLATES\\.design\\.tagline/);
  assert.match(edge, /const tagline = design\\.tagline[\\s\\S]*?: "";/);
  assert.match(admin, /const tagline = design\\.tagline[\\s\\S]*?: "";/);
  assert.match(admin, /\\$\\{tagline\\}/);
});
