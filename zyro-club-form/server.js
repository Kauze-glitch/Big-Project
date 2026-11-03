import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import nodemailer from "nodemailer";
import { validateRegistration } from "./lib/validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const apiUrl = (process.env.ZYRO_API_URL || "https://grhdawkxnrkgkahegnnd.supabase.co/functions/v1/zyro-api").replace(/\/$/, "");
const edgeSecret = process.env.ZYRO_EDGE_SECRET || "";
const mailEncryptionSecret = process.env.MAIL_SETTINGS_ENCRYPTION_KEY || "";

if (isProduction && !edgeSecret) {
  throw new Error("ZYRO_EDGE_SECRET is required in production.");
}
if (isProduction && !mailEncryptionSecret) {
  throw new Error("MAIL_SETTINGS_ENCRYPTION_KEY is required in production.");
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

const rateWindow = new Map();
function submitRateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || "unknown";
  const recent = (rateWindow.get(key) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 8) return res.status(429).json({ message: "Bạn gửi hơi nhanh. Thử lại sau ít phút nhé." });
  recent.push(now);
  rateWindow.set(key, recent);
  next();
}

function requireAdmin(req, res, next) {
  return requireEdgeAdmin(req, res, next);
}

function timingSafeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function mailEncryptionKey() {
  if (!mailEncryptionSecret) throw new Error("Chưa cấu hình khóa mã hóa App Password trên máy chủ.");
  return crypto.createHash("sha256").update(mailEncryptionSecret, "utf8").digest();
}

function encryptAppPassword(password) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", mailEncryptionKey(), iv);
  cipher.setAAD(Buffer.from("zyro-gmail-smtp-v1", "utf8"));
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };
}

function decryptAppPassword(payload) {
  if (!payload || payload.version !== 1 || typeof payload.iv !== "string" || typeof payload.tag !== "string" || typeof payload.data !== "string") {
    throw new Error("Thông tin App Password đã mã hóa không hợp lệ.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", mailEncryptionKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAAD(Buffer.from("zyro-gmail-smtp-v1", "utf8"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function requireEdgeAdmin(req, res, next) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="ZYRO Admin"');
    return res.status(401).json({ message: "Cần đăng nhập quản trị." });
  }
  try {
    await edgeFetch("/email-settings", { headers: { Authorization: authorization } });
    next();
  } catch (error) {
    if (error.status === 401) res.set("WWW-Authenticate", 'Basic realm="ZYRO Admin"');
    res.status(error.status || 503).json({ message: error.message || "Không xác thực được quyền quản trị." });
  }
}

async function loadSmtpSettings(authorization) {
  const stored = await edgeFetch("/email-settings", { headers: { Authorization: authorization } });
  if (!stored.configured || !stored.encryptedAppPassword) {
    throw new Error("Chưa cấu hình Gmail gửi email trong trang quản trị.");
  }
  return {
    senderEmail: stored.senderEmail,
    appPassword: decryptAppPassword(stored.encryptedAppPassword),
  };
}

function createGmailTransport(settings) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: settings.senderEmail, pass: settings.appPassword },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 25000,
  });
}

function smtpErrorMessage(error) {
  if (error?.code === "EAUTH" || error?.responseCode === 535) {
    return "Gmail từ chối đăng nhập. Hãy kiểm tra địa chỉ Gmail và App Password 16 ký tự; không dùng mật khẩu Gmail thông thường.";
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS"].includes(error?.code)) {
    return "Không kết nối được Gmail SMTP. Vui lòng thử lại sau.";
  }
  return "Gửi email qua Gmail SMTP không thành công. Hãy kiểm tra cấu hình và thử lại.";
}

async function edgeFetch(pathname, options = {}) {
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-zyro-secret": edgeSecret,
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || `ZYRO API error ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

app.get("/health", async (_req, res) => {
  try {
    await edgeFetch("/health");
    res.json({ ok: true, storage: "supabase" });
  } catch (error) {
    res.status(503).json({ ok: false, storage: "supabase", message: error.message });
  }
});

const allowedAdminOrigins = new Set([
  "https://zyro-volleyball-club.onrender.com",
  "https://zyro-club-form.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

app.use("/api/admin", (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedAdminOrigins.has(origin)) {
    return res.status(403).json({ message: "Nguồn truy cập không được phép." });
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/api/admin/email-settings", requireEdgeAdmin, async (req, res) => {
  try {
    const settings = await edgeFetch("/email-settings", {
      headers: { Authorization: req.headers.authorization },
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      senderEmail: settings.senderEmail || "",
      configured: Boolean(settings.configured),
      updatedAt: settings.updatedAt || null,
    });
  } catch (error) {
    res.status(error.status || 503).json({ message: error.message || "Không tải được cấu hình Gmail." });
  }
});

app.put("/api/admin/email-settings", requireEdgeAdmin, async (req, res) => {
  try {
    const senderEmail = String(req.body?.senderEmail || "").trim().toLowerCase();
    const appPassword = String(req.body?.appPassword || "").replace(/\s/g, "");
    if (!validEmail(senderEmail)) {
      return res.status(400).json({ message: "Nhập địa chỉ Gmail gửi đi hợp lệ." });
    }
    if (appPassword && !/^[A-Za-z0-9]{16}$/.test(appPassword)) {
      return res.status(400).json({ message: "App Password phải gồm đúng 16 ký tự. Hãy xóa khoảng trắng khi dán mã." });
    }

    const authorization = req.headers.authorization;
    const existing = await edgeFetch("/email-settings", { headers: { Authorization: authorization } });
    if (!appPassword && !existing.configured) {
      return res.status(400).json({ message: "Lần đầu cấu hình cần nhập App Password Gmail." });
    }

    const encryptedAppPassword = appPassword ? encryptAppPassword(appPassword) : undefined;
    const saved = await edgeFetch("/email-settings", {
      method: "PATCH",
      headers: { Authorization: authorization },
      body: JSON.stringify({
        senderEmail,
        ...(encryptedAppPassword ? { encryptedAppPassword } : {}),
      }),
    });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, senderEmail: saved.senderEmail, configured: Boolean(saved.configured), updatedAt: saved.updatedAt || null });
  } catch (error) {
    res.status(error.status || 503).json({ message: error.message || "Không lưu được cấu hình Gmail." });
  }
});

app.post("/api/admin/email-settings/test", requireEdgeAdmin, async (req, res) => {
  try {
    const settings = await loadSmtpSettings(req.headers.authorization);
    const transporter = createGmailTransport(settings);
    await transporter.verify();
    res.json({ ok: true, message: "Kết nối Gmail SMTP thành công.", senderEmail: settings.senderEmail });
  } catch (error) {
    res.status(502).json({ message: smtpErrorMessage(error) });
  }
});

app.post("/api/admin/email-settings/test-send", requireEdgeAdmin, async (req, res) => {
  try {
    const to = String(req.body?.to || "").trim().toLowerCase();
    if (!validEmail(to)) return res.status(400).json({ message: "Nhập email nhận thử hợp lệ." });
    const settings = await loadSmtpSettings(req.headers.authorization);
    const transporter = createGmailTransport(settings);
    const info = await transporter.sendMail({
      from: { name: "ZYRO Volleyball Club", address: settings.senderEmail },
      to,
      subject: "Kiểm tra email ZYRO Volleyball Club",
      text: "Đây là email thử để xác nhận cấu hình Gmail SMTP của ZYRO hoạt động.",
      html: "<p>Đây là email thử để xác nhận cấu hình Gmail SMTP của <strong>ZYRO Volleyball Club</strong> hoạt động.</p>",
    });
    res.json({ ok: true, message: "Đã gửi email thử.", messageId: info.messageId || null, to });
  } catch (error) {
    res.status(502).json({ message: smtpErrorMessage(error) });
  }
});

app.post("/api/admin/send-email", requireEdgeAdmin, async (req, res) => {
  try {
    const to = String(req.body?.to || "").trim().toLowerCase();
    const subject = String(req.body?.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
    const html = typeof req.body?.html === "string" ? req.body.html : "";
    const idempotencyKey = String(req.body?.idempotencyKey || "").trim();
    if (!validEmail(to) || !subject || !html || html.length > 30000 || !/^[a-z0-9_-]{8,160}$/i.test(idempotencyKey)) {
      return res.status(400).json({ message: "Thông tin email gửi đi không hợp lệ.", deliveryStatus: "pending" });
    }

    const settings = await loadSmtpSettings(req.headers.authorization);
    const transporter = createGmailTransport(settings);
    const deterministicMessageId = "<" + hash(idempotencyKey).slice(0, 32) + "@zyro-volleyball-club.onrender.com>";
    const info = await transporter.sendMail({
      from: { name: "ZYRO Volleyball Club", address: settings.senderEmail },
      to,
      subject,
      html,
      messageId: deterministicMessageId,
      headers: { "X-ZYRO-Idempotency-Key": idempotencyKey },
    });
    res.json({ ok: true, messageId: info.messageId || deterministicMessageId });
  } catch (error) {
    const authFailure = error?.code === "EAUTH" || error?.responseCode === 535;
    res.status(502).json({
      message: smtpErrorMessage(error),
      deliveryStatus: authFailure ? "pending" : "uncertain",
    });
  }
});

app.post("/api/registrations", submitRateLimit, async (req, res, next) => {
  try {
    const result = validateRegistration(req.body);
    if (!result.ok) return res.status(400).json({ message: "Kiểm tra lại thông tin nhé.", errors: result.errors });
    const item = await edgeFetch("/registrations", { method: "POST", body: JSON.stringify(result.data) });
    res.status(201).json({ id: item.id, message: "Đã nhận đăng ký." });
  } catch (error) {
    next(error);
  }
});

app.get("/admin", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "private", "admin.html")));
app.get("/api/admin/registrations", requireAdmin, async (req, res, next) => {
  try {
    res.json(await edgeFetch("/registrations", {
      headers: { Authorization: req.headers.authorization },
    }));
  } catch (error) {
    next(error);
  }
});
app.patch("/api/admin/registrations/:id", requireAdmin, async (req, res, next) => {
  try {
    if (!new Set(["new", "approved", "rejected"]).has(req.body.status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ." });
    }
    res.json(await edgeFetch(`/registrations/${encodeURIComponent(req.params.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: req.body.status }),
      headers: { Authorization: req.headers.authorization },
    }));
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Có lỗi máy chủ. Vui lòng thử lại sau." });
});

app.listen(port, "0.0.0.0", () => console.log(`ZYRO form running on http://localhost:${port}`));
