import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { validateRegistration } from "./lib/validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const adminUser = process.env.ADMIN_USER || "zyro";
const adminPassword = process.env.ADMIN_PASSWORD || "change-me";
const apiUrl = (process.env.ZYRO_API_URL || "https://grhdawkxnrkgkahegnnd.supabase.co/functions/v1/zyro-api").replace(/\/$/, "");
const edgeSecret = process.env.ZYRO_EDGE_SECRET || "";

if (isProduction && !edgeSecret) {
  throw new Error("ZYRO_EDGE_SECRET is required in production.");
}
if (isProduction && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "change-me")) {
  throw new Error("Set a strong ADMIN_PASSWORD before starting in production.");
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
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="ZYRO Admin"');
    return res.status(401).send("Cần đăng nhập quản trị.");
  }
  const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const user = separator >= 0 ? decoded.slice(0, separator) : "";
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";
  const userOk = timingSafeEqual(user, adminUser);
  const passwordOk = timingSafeEqual(password, adminPassword);
  if (!userOk || !passwordOk) {
    res.set("WWW-Authenticate", 'Basic realm="ZYRO Admin"');
    return res.status(401).send("Sai tài khoản quản trị.");
  }
  next();
}

function timingSafeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
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
    await edgeFetch("/registrations");
    res.json({ ok: true, storage: "supabase" });
  } catch (error) {
    res.status(503).json({ ok: false, storage: "supabase", message: error.message });
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
app.get("/api/admin/registrations", requireAdmin, async (_req, res, next) => {
  try {
    res.json(await edgeFetch("/registrations"));
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
