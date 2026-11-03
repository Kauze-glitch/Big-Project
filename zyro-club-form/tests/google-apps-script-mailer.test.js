import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../google-apps-script/Code.gs", import.meta.url), "utf8");

function createHarness({ quota = 10, sendError = null } = {}) {
  const properties = new Map([["ZYRO_MAILER_SECRET", "test-shared-secret"]]);
  const sentMessages = [];
  let remainingQuota = quota;

  const context = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key) || null,
        setProperty: (key, value) => { properties.set(key, String(value)); },
        getProperties: () => Object.fromEntries(properties),
        deleteProperty: (key) => { properties.delete(key); },
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    MailApp: {
      getRemainingDailyQuota: () => remainingQuota,
      sendEmail: (message) => {
        if (sendError) throw sendError;
        sentMessages.push(message);
        remainingQuota -= 1;
      },
    },
    Session: { getEffectiveUser: () => ({ getEmail: () => "zyro-test@gmail.com" }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      getUuid: () => "12345678-1234-1234-1234-123456789abc",
      computeDigest: (_algorithm, value) => [...createHash("sha256").update(String(value), "utf8").digest()].map((byte) => byte > 127 ? byte - 256 : byte),
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => ({ content, setMimeType() { return this; } }),
    },
    Logger: { log: () => {} },
  };

  vm.runInNewContext(source, context, { filename: "Code.gs" });

  function post(payload) {
    const output = context.doPost({ postData: { contents: JSON.stringify(payload) } });
    return JSON.parse(output.content);
  }

  return { context, post, properties, sentMessages };
}

test("rejects requests without the shared secret", () => {
  const harness = createHarness();
  const result = harness.post({ action: "status", secret: "wrong-secret" });
  assert.equal(result.ok, false);
  assert.match(result.message, /Không được phép/);
  assert.equal(harness.sentMessages.length, 0);
});

test("reports the effective Gmail sender and live recipient quota", () => {
  const harness = createHarness({ quota: 42 });
  const result = harness.post({ action: "status", secret: "test-shared-secret" });
  assert.equal(result.ok, true);
  assert.equal(result.senderEmail, "zyro-test@gmail.com");
  assert.equal(result.remainingDailyQuota, 42);
});

test("sends once and reuses the receipt for a repeated idempotency key", () => {
  const harness = createHarness();
  const request = {
    action: "send",
    secret: "test-shared-secret",
    to: "member@example.com",
    subject: "ZYRO test",
    html: "<p>Hello <strong>ZYRO</strong></p>",
    idempotencyKey: "zyro-test-key-001",
  };

  const first = harness.post(request);
  const second = harness.post(request);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, true);
  assert.equal(second.messageId, first.messageId);
  assert.equal(harness.sentMessages.length, 1);
  assert.equal(harness.sentMessages[0].to, "member@example.com");
  assert.match(harness.sentMessages[0].body, /Hello/);
  assert.match(harness.sentMessages[0].htmlBody, /<strong>ZYRO<\/strong>/);
});

test("does not send when Google's daily recipient quota is exhausted", () => {
  const harness = createHarness({ quota: 0 });
  const result = harness.post({
    action: "send",
    secret: "test-shared-secret",
    to: "member@example.com",
    subject: "ZYRO test",
    html: "<p>Hello</p>",
    idempotencyKey: "zyro-test-key-002",
  });

  assert.equal(result.ok, false);
  assert.equal(result.deliveryStatus, "pending");
  assert.equal(harness.sentMessages.length, 0);
});

test("locks an uncertain send so a retry cannot send a duplicate", () => {
  const harness = createHarness({ sendError: new Error("simulated mail failure") });
  const request = {
    action: "send",
    secret: "test-shared-secret",
    to: "member@example.com",
    subject: "ZYRO test",
    html: "<p>Hello</p>",
    idempotencyKey: "zyro-test-key-003",
  };

  const first = harness.post(request);
  const second = harness.post(request);

  assert.equal(first.ok, false);
  assert.equal(first.deliveryStatus, "uncertain");
  assert.equal(second.ok, false);
  assert.equal(second.deliveryStatus, "uncertain");
  assert.equal(harness.sentMessages.length, 0);
});
