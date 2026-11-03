const SECRET_PROPERTY = "ZYRO_MAILER_SECRET";
const IDEMPOTENCY_PREFIX = "ZYRO_MAILER_IDEMPOTENCY_";
const IDEMPOTENCY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function doGet() {
  return jsonOutput({
    ok: true,
    service: "ZYRO Google Apps Script Mail Relay",
    message: "POST only. Configure the shared secret before connecting Render."
  });
}

function doPost(event) {
  let request;
  try {
    request = JSON.parse(event && event.postData && event.postData.contents || "{}");
  } catch (_error) {
    return jsonOutput({ ok: false, deliveryStatus: "pending", message: "Dữ liệu JSON không hợp lệ." });
  }

  const expectedSecret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY) || "";
  if (!expectedSecret || !constantTimeEquals(String(request.secret || ""), expectedSecret)) {
    return jsonOutput({ ok: false, deliveryStatus: "pending", message: "Không được phép truy cập Google Apps Script Mail Relay." });
  }

  if (request.action === "status") {
    try {
      return jsonOutput({
        ok: true,
        senderEmail: Session.getEffectiveUser().getEmail() || "",
        remainingDailyQuota: MailApp.getRemainingDailyQuota()
      });
    } catch (_error) {
      return jsonOutput({ ok: false, deliveryStatus: "pending", message: "Google Apps Script chưa được cấp quyền gửi email. Hãy chạy authorizeZyroMailer trong trình chỉnh sửa Apps Script." });
    }
  }

  if (request.action === "send") return sendZyroEmail(request);
  return jsonOutput({ ok: false, deliveryStatus: "pending", message: "Thao tác Mail Relay không hợp lệ." });
}

function sendZyroEmail(request) {
  const to = String(request.to || "").trim().toLowerCase();
  const subject = String(request.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
  const html = typeof request.html === "string" ? request.html : "";
  const idempotencyKey = String(request.idempotencyKey || "").trim();

  if (!isValidEmail(to) || !subject || !html || html.length > 30000 || !/^[a-z0-9_-]{8,160}$/i.test(idempotencyKey)) {
    return jsonOutput({ ok: false, deliveryStatus: "pending", message: "Thông tin email gửi đi không hợp lệ." });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    return jsonOutput({ ok: false, deliveryStatus: "pending", message: "Đang có email khác được xử lý. Vui lòng thử lại sau ít phút." });
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    pruneIdempotencyRecords(properties);

    const recordKey = IDEMPOTENCY_PREFIX + sha256Hex(idempotencyKey);
    const previousRaw = properties.getProperty(recordKey);
    if (previousRaw) {
      let previous;
      try {
        previous = JSON.parse(previousRaw);
      } catch (_error) {
        previous = null;
      }

      if (previous && previous.status === "sent" && previous.messageId) {
        return jsonOutput({
          ok: true,
          messageId: previous.messageId,
          duplicate: true,
          remainingDailyQuota: MailApp.getRemainingDailyQuota()
        });
      }

      if (previous && (previous.status === "processing" || previous.status === "uncertain")) {
        return jsonOutput({
          ok: false,
          deliveryStatus: "uncertain",
          message: "Yêu cầu này đã bắt đầu gửi nhưng chưa có xác nhận cuối cùng. Hãy kiểm tra Gmail mục Đã gửi trước khi thao tác lại."
        });
      }
    }

    const remainingDailyQuota = MailApp.getRemainingDailyQuota();
    if (remainingDailyQuota < 1) {
      return jsonOutput({
        ok: false,
        deliveryStatus: "pending",
        message: "Tài khoản Gmail đã hết hạn mức gửi email hôm nay. Vui lòng thử lại sau khi Google đặt lại hạn mức."
      });
    }

    const startedAt = Date.now();
    properties.setProperty(recordKey, JSON.stringify({ status: "processing", createdAt: startedAt }));

    try {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        body: plainTextFromHtml(html),
        htmlBody: html,
        name: "ZYRO Volleyball Club"
      });

      const messageId = "apps-script:" + sha256Hex(idempotencyKey).slice(0, 32);
      properties.setProperty(recordKey, JSON.stringify({ status: "sent", messageId: messageId, createdAt: startedAt }));

      return jsonOutput({
        ok: true,
        messageId: messageId,
        remainingDailyQuota: MailApp.getRemainingDailyQuota()
      });
    } catch (_error) {
      properties.setProperty(recordKey, JSON.stringify({ status: "uncertain", createdAt: startedAt }));
      return jsonOutput({
        ok: false,
        deliveryStatus: "uncertain",
        message: "Google Apps Script không xác nhận được kết quả gửi. Hệ thống đã khóa yêu cầu này để tránh gửi trùng; hãy kiểm tra Gmail mục Đã gửi."
      });
    }
  } finally {
    lock.releaseLock();
  }
}

function setupZyroMailerSecret() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(SECRET_PROPERTY)) {
    Logger.log("ZYRO_MAILER_SECRET đã tồn tại. Không tạo lại để tránh làm mất kết nối Render.");
    return;
  }
  const secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  properties.setProperty(SECRET_PROPERTY, secret);
  Logger.log("Copy giá trị sau vào Render Environment: MAILER_SHARED_SECRET=" + secret);
}

function rotateZyroMailerSecret() {
  const secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  PropertiesService.getScriptProperties().setProperty(SECRET_PROPERTY, secret);
  Logger.log("Secret đã được đổi. Cập nhật ngay Render Environment MAILER_SHARED_SECRET=" + secret);
}

function authorizeZyroMailer() {
  Logger.log("Tài khoản gửi: " + (Session.getEffectiveUser().getEmail() || "Google account"));
  Logger.log("Số người nhận còn lại trong hạn mức hiện tại: " + MailApp.getRemainingDailyQuota());
}

function pruneIdempotencyRecords(properties) {
  const all = properties.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (key) {
    if (!key.startsWith(IDEMPOTENCY_PREFIX)) return;
    try {
      const record = JSON.parse(all[key]);
      if (!record || !Number.isFinite(record.createdAt) || now - record.createdAt > IDEMPOTENCY_TTL_MS) {
        properties.deleteProperty(key);
      }
    } catch (_error) {
      properties.deleteProperty(key);
    }
  });
}

function plainTextFromHtml(html) {
  return String(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function constantTimeEquals(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function sha256Hex(value) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return digest.map(function (byte) {
    return (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0");
  }).join("");
}

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
