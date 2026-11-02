import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";
import { validateRegistration } from "./lib/validation.js";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL?.trim();
const isProduction = process.env.NODE_ENV === "production";
const adminUser = process.env.ADMIN_USER || "zyro";
const adminPassword = process.env.ADMIN_PASSWORD || "change-me";

if (isProduction && !databaseUrl) {
  throw new Error("DATABASE_URL is required in production.");
}
if (isProduction && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "change-me")) {
  throw new Error("Set a strong ADMIN_PASSWORD before starting in production.");
}

const pool = databaseUrl
  ? new Pool({ connectionString: databaseUrl, ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false } })
  : null;
const localFile = path.join(__dirname, ".data", "registrations.json");

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

async function initStorage() {
  if (pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        zalo_name TEXT NOT NULL,
        duration TEXT NOT NULL,
        gender TEXT NOT NULL,
        position TEXT NOT NULL,
        level TEXT NOT NULL,
        goal TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new'
      )
    `);
    return;
  }
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  try {
    await fs.access(localFile);
  } catch {
    await fs.writeFile(localFile, "[]\n", "utf8");
  }
}

async function readLocal() {
  return JSON.parse(await fs.readFile(localFile, "utf8"));
}

async function addRegistration(data) {
  const item = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data, status: "new" };
  if (pool) {
    await pool.query(
      `INSERT INTO registrations (id, created_at, zalo_name, duration, gender, position, level, goal, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [item.id, item.createdAt, item.zaloName, item.duration, item.gender, item.position, item.level, item.goal, item.status],
    );
  } else {
    const items = await readLocal();
    items.unshift(item);
    await fs.writeFile(localFile, JSON.stringify(items, null, 2) + "\n", "utf8");
  }
  return item;
}

async function listRegistrations() {
  if (pool) {
    const result = await pool.query(`
      SELECT id, created_at AS "createdAt", zalo_name AS "zaloName", duration, gender, position, level, goal, status
      FROM registrations ORDER BY created_at DESC LIMIT 500
    `);
    return result.rows;
  }
  return readLocal();
}

async function setStatus(id, status) {
  if (!new Set(["new", "approved", "rejected"]).has(status)) return false;
  if (pool) {
    const result = await pool.query("UPDATE registrations SET status=$1 WHERE id=$2", [status, id]);
    return result.rowCount > 0;
  }
  const items = await readLocal();
  const item = items.find((entry) => entry.id === id);
  if (!item) return false;
  item.status = status;
  await fs.writeFile(localFile, JSON.stringify(items, null, 2) + "\n", "utf8");
  return true;
}

app.get("/health", (_req, res) => res.json({ ok: true, storage: pool ? "postgres" : "local" }));

app.post("/api/registrations", submitRateLimit, async (req, res, next) => {
  try {
    const result = validateRegistration(req.body);
    if (!result.ok) return res.status(400).json({ message: "Kiểm tra lại thông tin nhé.", errors: result.errors });
    const item = await addRegistration(result.data);
    res.status(201).json({ id: item.id, message: "Đã nhận đăng ký." });
  } catch (error) {
    next(error);
  }
});

app.get("/admin", requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, "private", "admin.html")));
app.get("/api/admin/registrations", requireAdmin, async (_req, res, next) => {
  try {
    res.json({ registrations: await listRegistrations() });
  } catch (error) {
    next(error);
  }
});
app.patch("/api/admin/registrations/:id", requireAdmin, async (req, res, next) => {
  try {
    const updated = await setStatus(req.params.id, req.body.status);
    if (!updated) return res.status(404).json({ message: "Không tìm thấy đăng ký." });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Có lỗi máy chủ. Vui lòng thử lại sau." });
});

await initStorage();
app.listen(port, "0.0.0.0", () => console.log(`ZYRO form running on http://localhost:${port}`));
