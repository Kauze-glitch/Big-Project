
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { resolveRejectionReason } from "./rejection-reason.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
const SERVICE_KEY = secretKeysRaw
  ? JSON.parse(secretKeysRaw)["default"]
  : (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const ADMIN_USER = "idang98";
const ADMIN_PASSWORD_SHA256 = Deno.env.get("ADMIN_PASSWORD_SHA256") ?? "";


const DEFAULT_EMAIL_TEMPLATES = {
  design: {
    logoUrl: "https://zyro-volleyball-club.onrender.com/assets/zyro-logo.webp",
    brandName: "ZYRO VOLLEYBALL CLUB",
    tagline: "PLAY TOGETHER. GROW TOGETHER.",
    headerColor: "#0b2d5f",
    accentColor: "#d71e32",
    footerText: "Email tự động từ ZYRO Volleyball Club. Vui lòng không trả lời email này."
  },
  approved: {
    subject: "ZYRO | Đăng ký của bạn đã được chấp nhận!",
    preheader: "Chào mừng bạn đến với ZYRO Volleyball Club.",
    title: "Bạn đã được ZYRO chấp nhận!",
    showProfile: true,
    bodyHtml: "<p>Chào <strong>{{zalo_name}}</strong>! 🏐</p><p>Ban quản trị ZYRO đã xem xét và chấp nhận đơn đăng ký của bạn.</p><p>Yêu cầu tham gia nhóm Zalo hiện đang chờ phó nhóm phê duyệt. Bạn vui lòng chờ thông báo nhé!</p><p>Hẹn gặp bạn trên sân!</p>"
  },
  rejected: {
    subject: "ZYRO | Phản hồi đăng ký thành viên",
    preheader: "Cảm ơn bạn đã quan tâm đến ZYRO Volleyball Club.",
    title: "Cảm ơn bạn đã quan tâm đến ZYRO",
    showProfile: true,
    bodyHtml: "<p>Chào <strong>{{zalo_name}}</strong>,</p><p>Sau khi xem xét thông tin đăng ký và mong muốn tham gia của bạn, Ban quản trị rất tiếc hiện tại chưa thể chấp nhận đăng ký.</p><p><strong>Lý do:</strong> {{reason}}</p><p>Cảm ơn bạn đã dành thời gian tìm hiểu và đăng ký tham gia ZYRO. Chúc bạn luôn có những trận đấu vui vẻ!</p>"
  }
};

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character] ?? character));
}

function sanitizeEmailHtml(value: unknown) {
  let html = text(value, 14000).replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|video|audio)[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|video|audio)\b[^>]*\/?\s*>/gi, "");
  const allowed = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a", "h2", "h3", "blockquote", "span"]);
  html = html.replace(/<\/?([a-z0-9]+)\b[^>]*>/gi, (tag, rawName) => {
    const name = String(rawName).toLowerCase();
    if (!allowed.has(name)) return "";
    const closing = /^<\//.test(tag);
    if (closing) return name === "br" ? "" : "</" + name + ">";
    if (name === "br") return "<br>";
    if (name !== "a") return "<" + name + ">";
    const hrefMatch = tag.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
    const href = hrefMatch?.[2] ?? "";
    if (!/^https?:\/\//i.test(href)) return "<a>";
    return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">';
  });
  return html;
}

function cleanEmailTemplate(input: any, fallback: any) {
  const subject = text(input?.subject, 180).replace(/[\r\n]+/g, " ");
  return {
    subject: subject || fallback.subject,
    preheader: text(input?.preheader, 180) || fallback.preheader,
    title: text(input?.title, 120) || fallback.title,
    showProfile: input?.showProfile !== false,
    bodyHtml: sanitizeEmailHtml(input?.bodyHtml) || fallback.bodyHtml
  };
}

function sanitizeEmailTemplates(input: any) {
  const designInput = input?.design ?? {};
  const logoUrl = text(designInput.logoUrl, 500);
  const safeLogoUrl = logoUrl && /^https:\/\//i.test(logoUrl)
    ? logoUrl
    : DEFAULT_EMAIL_TEMPLATES.design.logoUrl;
  const color = (value: unknown, fallback: string) =>
    /^#[0-9a-f]{6}$/i.test(text(value, 7)) ? text(value, 7) : fallback;
  return {
    design: {
      logoUrl: safeLogoUrl,
      brandName: text(designInput.brandName, 80) || DEFAULT_EMAIL_TEMPLATES.design.brandName,
      tagline: typeof designInput.tagline === "string"
        ? text(designInput.tagline, 120)
        : DEFAULT_EMAIL_TEMPLATES.design.tagline,
      headerColor: color(designInput.headerColor, DEFAULT_EMAIL_TEMPLATES.design.headerColor),
      accentColor: color(designInput.accentColor, DEFAULT_EMAIL_TEMPLATES.design.accentColor),
      footerText: text(designInput.footerText, 240) || DEFAULT_EMAIL_TEMPLATES.design.footerText
    },
    approved: cleanEmailTemplate(input?.approved, DEFAULT_EMAIL_TEMPLATES.approved),
    rejected: cleanEmailTemplate(input?.rejected, DEFAULT_EMAIL_TEMPLATES.rejected)
  };
}

function emailOptionLabel(config: any, category: string, value: string) {
  const options = config?.formOptions?.[category];
  return Array.isArray(options)
    ? (options.find((item: any) => item.id === value)?.label || value || "Chưa có")
    : (value || "Chưa có");
}

function renderDecisionEmail(config: any, template: any, registration: any, reason = "", bodyOverride?: string) {
  const design = config.emailTemplates.design;
  const baseUrl = text(Deno.env.get("PUBLIC_SITE_URL"), 500).replace(/\/$/, "");
  const logoUrl = design.logoUrl || (baseUrl ? baseUrl + "/assets/zyro-logo.webp" : DEFAULT_EMAIL_TEMPLATES.design.logoUrl);
  const values: Record<string, string> = {
    zalo_name: escapeHtml(registration.zalo_name),
    duration: escapeHtml(emailOptionLabel(config, "duration", registration.duration)),
    gender: escapeHtml(emailOptionLabel(config, "gender", registration.gender)),
    position: escapeHtml(emailOptionLabel(config, "position", registration.position)),
    level: escapeHtml(emailOptionLabel(config, "level", registration.level)),
    goal: escapeHtml(registration.goal).replace(/\r?\n/g, "<br>"),
    created_at: escapeHtml(new Date(registration.created_at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })),
    reason: escapeHtml(reason)
  };
  const bodySource = bodyOverride ?? template.bodyHtml;
  const body = String(bodySource || "").replace(/\{\{([a-z_]+)\}\}/g, (_match, key) => values[key] ?? "");
  const profileRows = [
    ["Tên Zalo", values.zalo_name],
    ["Thời gian tham gia", values.duration],
    ["Giới tính", values.gender],
    ["Vị trí chơi", values.position],
    ["Trình độ", values.level],
    ["Ngày đăng ký", values.created_at]
  ];
  let profile = "";
  if (template.showProfile) {
    profile = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f1f5f9;border-radius:12px;margin:24px 0;">' +
      '<tr><td colspan="2" style="padding:18px 18px 10px;font:700 13px Arial,sans-serif;letter-spacing:.06em;color:#0b2d5f;">THÔNG TIN ĐĂNG KÝ</td></tr>' +
      profileRows.map(([label, value]) => '<tr><td style="padding:7px 18px;color:#64748b;font:13px Arial,sans-serif;">' + label + '</td><td align="right" style="padding:7px 18px;color:#17263c;font:600 13px Arial,sans-serif;">' + value + '</td></tr>').join("") +
      '<tr><td colspan="2" style="padding:10px 18px 6px;color:#64748b;font:12px Arial,sans-serif;">MONG MUỐN KHI THAM GIA</td></tr>' +
      '<tr><td colspan="2" style="padding:0 18px 18px;color:#334155;font:13px/1.6 Arial,sans-serif;">' + values.goal + '</td></tr></table>';
  }
  const logo = logoUrl
    ? '<img src="' + escapeHtml(logoUrl) + '" alt="ZYRO" width="112" style="display:block;width:112px;max-width:100%;height:auto;margin:0 auto 10px;">'
    : "";
  const tagline = design.tagline
    ? '<div style="margin-top:7px;color:#dbe7f5;font-size:10px;letter-spacing:.13em;">' + escapeHtml(design.tagline) + '</div>'
    : "";
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:24px 10px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#17263c;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">' + escapeHtml(template.preheader) + '</div>' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:18px;overflow:hidden;">' +
    '<tr><td align="center" style="padding:26px 24px 24px;background:' + design.headerColor + ';">' + logo +
    '<div style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:.12em;">' + escapeHtml(design.brandName) + '</div>' +
    tagline + '</td></tr>' +
    '<tr><td style="padding:30px 28px 20px;"><div style="width:42px;height:4px;margin-bottom:18px;background:' + design.accentColor + ';border-radius:8px;"></div>' +
    '<h1 style="margin:0 0 18px;color:#0b2d5f;font-size:25px;line-height:1.25;">' + escapeHtml(template.title) + '</h1>' +
    '<div style="font-size:15px;line-height:1.75;color:#475569;">' + body + '</div>' + profile +
    '<div style="padding-top:18px;border-top:1px solid #e2e8f0;text-align:center;color:#0b2d5f;font-size:14px;font-weight:700;">ZYRO VOLLEYBALL CLUB</div></td></tr>' +
    '<tr><td align="center" style="padding:16px 24px 20px;background:#f8fafc;color:#64748b;font-size:11px;line-height:1.6;">' + escapeHtml(design.footerText) + '</td></tr>' +
    '</table></body></html>';
}

async function sendDecisionEmail(to: string, subject: string, html: string, idempotencyKey: string, authorization: string) {
  const mailerUrl = text(Deno.env.get("ZYRO_MAILER_URL"), 500).replace(/\/$/, "") || "https://zyro-club-form.onrender.com";
  if (!authorization.startsWith("Basic ")) throw new Error("Thiếu xác thực quản trị khi chuyển email đến Google Apps Script.");
  const response = await fetch(mailerUrl + "/api/admin/send-email", {
    method: "POST",
    headers: {
      "authorization": authorization,
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      to,
      subject: subject.replace(/[\r\n]+/g, " "),
      html,
      idempotencyKey
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(text(result?.message, 500) || "Google Apps Script Mail Relay trả về HTTP " + response.status + ".");
    (error as any).deliveryStatus = result?.deliveryStatus === "uncertain" ? "uncertain" : "pending";
    throw error;
  }
  const messageId = text(result?.messageId, 180);
  if (!messageId) {
    const error = new Error("Google Apps Script chưa trả về mã xác nhận tiếp nhận email.");
    (error as any).deliveryStatus = "uncertain";
    throw error;
  }
  return messageId;
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "authorization,content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Apps Script keeps hashed send receipts for 30 days. Keep the retry window
// slightly shorter so a known-not-sent quota/lock response can be retried
// after Google's 24-hour quota reset without risking a duplicate send.
const MAIL_IDEMPOTENCY_WINDOW_MS = 29 * 24 * 60 * 60 * 1000;

async function getOrCreateDecisionEmailOutbox(idempotencyKey: string, registrationId: string, decisionStatus: string) {
  const columns = "idempotency_key,registration_id,decision_status,delivery_status,provider_message_id,created_at";
  const { data: existing, error: readError } = await supabase
    .from("zyro_decision_email_outbox")
    .select(columns)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;

  const { data: inserted, error: insertError } = await supabase
    .from("zyro_decision_email_outbox")
    .insert({
      idempotency_key: idempotencyKey,
      registration_id: registrationId,
      decision_status: decisionStatus,
      delivery_status: "pending"
    })
    .select(columns)
    .single();
  if (insertError?.code === "23505") {
    const { data: raced, error: raceReadError } = await supabase
      .from("zyro_decision_email_outbox")
      .select(columns)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (raceReadError) throw raceReadError;
    if (raced) return raced;
  }
  if (insertError) throw insertError;
  return inserted;
}

async function markDecisionEmailOutboxSent(idempotencyKey: string, providerMessageId: string) {
  const { data, error } = await supabase
    .from("zyro_decision_email_outbox")
    .update({
      delivery_status: "sent",
      provider_message_id: providerMessageId,
      updated_at: new Date().toISOString()
    })
    .eq("idempotency_key", idempotencyKey)
    .eq("delivery_status", "pending")
    .select("delivery_status,provider_message_id")
    .maybeSingle();
  if (error) throw error;
  if (data?.delivery_status === "sent" && data.provider_message_id === providerMessageId) return data;

  const { data: current, error: currentError } = await supabase
    .from("zyro_decision_email_outbox")
    .select("delivery_status,provider_message_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (currentError) throw currentError;
  if (current?.delivery_status === "sent" && current.provider_message_id === providerMessageId) return current;
  throw new Error("Không thể lưu trạng thái xác nhận email vào cơ sở dữ liệu.");
}

async function markDecisionEmailOutboxUncertain(idempotencyKey: string) {
  const { error } = await supabase
    .from("zyro_decision_email_outbox")
    .update({ delivery_status: "uncertain", updated_at: new Date().toISOString() })
    .eq("idempotency_key", idempotencyKey)
    .eq("delivery_status", "pending");
  if (error) throw error;
}

async function isAdmin(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Basic ")) return false;
  try {
    const decoded = atob(auth.slice(6));
    const split = decoded.indexOf(":");
    if (split < 0) return false;
    const user = decoded.slice(0, split);
    const password = decoded.slice(split + 1);
    return user === ADMIN_USER && (await sha256(password)) === ADMIN_PASSWORD_SHA256;
  } catch {
    return false;
  }
}

function unauthorized() {
  return new Response(JSON.stringify({ message: "Unauthorized" }), {
    status: 401,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "www-authenticate": 'Basic realm="ZYRO Admin"'
    }
  });
}

function text(value: unknown, max: number, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

function cleanId(value: unknown) {
  const raw = text(value, 64).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return raw || crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function cleanOptions(value: unknown, withDescription = false) {
  const source = Array.isArray(value) ? value.slice(0, 20) : [];
  const items = source.map((item: any) => {
    const option: Record<string, string> = {
      id: cleanId(item?.id),
      label: text(item?.label, 60)
    };
    if (withDescription) option.description = text(item?.description, 140);
    return option;
  }).filter((item) => item.label);
  return uniqueById(items as Array<{ id: string; label: string; description?: string }>);
}

function sanitizeConfig(input: any) {
  const hero = input?.hero ?? {};
  const signup = input?.signup ?? {};

  const schedule = uniqueById(
    (Array.isArray(input?.schedule) ? input.schedule.slice(0, 14) : [])
      .map((item: any) => ({
        id: cleanId(item?.id),
        day: text(item?.day, 16),
        start: text(item?.start, 8),
        end: text(item?.end, 8),
      }))
      .filter((item: any) => item.day && item.start && item.end)
  );

  const principles = uniqueById(
    (Array.isArray(input?.principles) ? input.principles.slice(0, 8) : [])
      .map((item: any) => ({
        id: cleanId(item?.id),
        title: text(item?.title, 70),
        body: text(item?.body, 220),
      }))
      .filter((item: any) => item.title && item.body)
  );

  const contacts = uniqueById(
    (Array.isArray(input?.contacts) ? input.contacts.slice(0, 12) : [])
      .map((item: any) => ({
        id: cleanId(item?.id),
        name: text(item?.name, 70),
        role: text(item?.role, 70),
        phone: text(item?.phone, 24).replace(/[^0-9+]/g, ""),
      }))
      .filter((item: any) => item.name && item.phone)
  );

  const formOptions = input?.formOptions ?? {};
  const duration = cleanOptions(formOptions.duration, true);
  const gender = cleanOptions(formOptions.gender, false);
  const position = cleanOptions(formOptions.position, false);
  const level = cleanOptions(formOptions.level, false);

  if (!duration.length || !gender.length || !position.length || !level.length) {
    throw new Error("Mỗi nhóm tuỳ chọn form phải có ít nhất một lựa chọn.");
  }

  return {
    hero: {
      titleLine1: text(hero.titleLine1, 50, "Chơi vui."),
      titleLine2: text(hero.titleLine2, 50, "Tiến bộ."),
      lead: text(hero.lead, 320)
    },
    schedule,
    principles,
    signup: {
      title: text(signup.title, 90),
      intro: text(signup.intro, 320),
      privacyNote: text(signup.privacyNote, 180),
      successTitle: text(signup.successTitle, 90),
      successMessage: text(signup.successMessage, 360)
    },
    contacts,
    formOptions: { duration, gender, position, level },
    emailTemplates: sanitizeEmailTemplates(input?.emailTemplates)
  };
}

async function getConfigRow() {
  const { data, error } = await supabase
    .from("zyro_site_config")
    .select("data,updated_at")
    .eq("id", "main")
    .single();
  if (error) throw error;
  return { config: sanitizeConfig(data.data), updatedAt: data.updated_at };
}

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function safeSearch(value: string | null) {
  return text(value ?? "", 80).replace(/[%_]/g, "");
}

function mapRegistration(r: any) {
  return {
    id: r.id,
    createdAt: r.created_at,
    zaloName: r.zalo_name,
    duration: r.duration,
    gender: r.gender,
    position: r.position,
    level: r.level,
    goal: r.goal,
    email: r.email ?? "",
    status: r.status
  };
}

function mapZaloMappingRegistration(r: any) {
  return {
    ...mapRegistration(r),
    zaloUserId: r.zalo_user_id ?? "",
    zaloGroupId: r.zalo_group_id ?? "",
    zaloConnectionId: r.zalo_connection_id ?? "",
    zaloMappingStatus: r.zalo_mapping_status ?? "unmapped",
    zaloMappedAt: r.zalo_mapped_at ?? null,
    zaloMappedBy: r.zalo_mapped_by ?? "",
  };
}

const DRAFT_GENDER_BY_FORM: Record<string, string> = {
  male: "Male",
  female: "Female",
};

const DRAFT_ROLE_BY_FORM: Record<string, string> = {
  attacker: "Attack",
  defender: "Defense",
  setter: "Setter",
  allrounder: "FullStack",
};

const DRAFT_LEVEL_BY_FORM: Record<string, string> = {
  newbie: "New",
  intermediate: "Average",
  good: "Good",
};

function mappingError(message: string, status = 502) {
  const error = new Error(message);
  (error as any).status = status;
  return error;
}

let draftMappingConfigPromise: Promise<{ baseUrl: string; internalKey: string }> | null = null;

async function getDraftMappingConfig() {
  const envBaseUrl = text(Deno.env.get("DRAFT_API_BASE_URL"), 500).replace(/\/+$/, "");
  const envInternalKey = Deno.env.get("ZYRO_MAPPING_INTERNAL_KEY") ?? "";
  if (envBaseUrl && new TextEncoder().encode(envInternalKey).length >= 32) {
    return { baseUrl: envBaseUrl, internalKey: envInternalKey };
  }

  if (!draftMappingConfigPromise) {
    draftMappingConfigPromise = (async () => {
      const { data, error } = await supabase.rpc("get_zyro_mapping_runtime_config");
      if (error) {
        throw mappingError(
          "Không thể đọc cấu hình mapping từ Supabase Vault. Hãy kiểm tra quyền service_role và cấu hình Vault.",
          503,
        );
      }

      const config = new Map<string, string>(
        (Array.isArray(data) ? data : []).map((row: any) => [
          String(row?.name ?? ""),
          String(row?.value ?? ""),
        ]),
      );
      const baseUrl = text(config.get("zyro_draft_api_base_url"), 500).replace(/\/+$/, "");
      const internalKey = text(config.get("zyro_mapping_internal_key"), 500);
      if (!baseUrl || new TextEncoder().encode(internalKey).length < 32) {
        throw mappingError(
          "Thiếu zyro_draft_api_base_url hoặc zyro_mapping_internal_key trong Supabase Vault.",
          503,
        );
      }
      return { baseUrl, internalKey };
    })().catch((error) => {
      draftMappingConfigPromise = null;
      throw error;
    });
  }

  return await draftMappingConfigPromise;
}

async function requestDraftMapping(path: string, options: RequestInit = {}) {
  const { baseUrl: configuredBaseUrl, internalKey } = await getDraftMappingConfig();

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw mappingError("DRAFT_API_BASE_URL không phải URL hợp lệ.", 503);
  }
  if ((baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) ||
      baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash || baseUrl.username || baseUrl.password) {
    throw mappingError("DRAFT_API_BASE_URL phải là HTTPS origin của Draft API, không kèm path hoặc thông tin đăng nhập.", 503);
  }

  let response: Response;
  try {
    response = await fetch(new URL(path.replace(/^\/+/, ""), `${baseUrl.origin}/`), {
      ...options,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-zyro-mapping-key": internalKey,
      },
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw mappingError("Không kết nối được Draft API. Hãy kiểm tra dịch vụ Draft và DRAFT_API_BASE_URL.", 502);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      throw mappingError("Draft từ chối shared key. Hãy đối chiếu ZYRO_MAPPING_INTERNAL_KEY và ZyroMapping:InternalKey.", 502);
    }
    throw mappingError(
      text((payload as any)?.message, 500) || `Draft API trả về HTTP ${response.status}.`,
      response.status,
    );
  }
  if (payload === null) throw mappingError("Draft API không trả về JSON hợp lệ.", 502);
  return payload;
}

async function getRegistrationCounts() {
  const statuses = ["new", "approved", "rejected"] as const;
  const [allResult, ...statusResults] = await Promise.all([
    supabase.from("zyro_registrations").select("id", { count: "exact", head: true }),
    ...statuses.map((status) =>
      supabase.from("zyro_registrations").select("id", { count: "exact", head: true }).eq("status", status)
    )
  ]);

  if (allResult.error) throw allResult.error;
  statusResults.forEach((result) => {
    if (result.error) throw result.error;
  });

  return {
    all: allResult.count ?? 0,
    new: statusResults[0].count ?? 0,
    approved: statusResults[1].count ?? 0,
    rejected: statusResults[2].count ?? 0,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, "");
    const registrationMatch = pathname.match(/\/registrations\/([0-9a-f-]+)$/i);
    const decisionMatch = pathname.match(/\/registrations\/([0-9a-f-]+)\/decision$/i);
    const isRegistrations = pathname === "/registrations" || pathname.endsWith("/zyro-api/registrations");
    const isBulkRegistrations = pathname === "/registrations/bulk" || pathname.endsWith("/zyro-api/registrations/bulk");
    const isConfig = pathname === "/config" || pathname.endsWith("/zyro-api/config");
    const isHealth = pathname === "/health" || pathname.endsWith("/zyro-api/health");
    const isEmailSettings = pathname === "/email-settings" || pathname.endsWith("/zyro-api/email-settings");
    const mappingMembersMatch = pathname.match(/\/zalo-mapping\/groups\/([^/]+)\/([^/]+)\/members$/);
    const isZaloMappingGroups = pathname === "/zalo-mapping/groups" || pathname.endsWith("/zyro-api/zalo-mapping/groups");
    const isZaloMappingRegistrations = pathname === "/zalo-mapping/registrations" || pathname.endsWith("/zyro-api/zalo-mapping/registrations");
    const isZaloMappingSync = pathname === "/zalo-mapping/sync" || pathname.endsWith("/zyro-api/zalo-mapping/sync");
    const isZaloMappingPath = isZaloMappingGroups || Boolean(mappingMembersMatch) || isZaloMappingRegistrations || isZaloMappingSync;

    if (isZaloMappingPath) {
      if (!(await isAdmin(req))) return unauthorized();

      try {
        if (req.method === "GET" && isZaloMappingGroups) {
          const groups = await requestDraftMapping("/api/internal/zyro-mapping/groups");
          if (!Array.isArray(groups)) throw mappingError("Draft trả về danh sách nhóm không hợp lệ.", 502);
          return json({ groups });
        }

        if (req.method === "GET" && mappingMembersMatch) {
          let connectionId = "";
          let groupId = "";
          try {
            connectionId = decodeURIComponent(mappingMembersMatch[1]).trim();
            groupId = decodeURIComponent(mappingMembersMatch[2]).trim();
          } catch {
            return json({ message: "Mã tài khoản hoặc nhóm Zalo không hợp lệ." }, 400);
          }
          if (!connectionId || !groupId || connectionId.length > 128 || groupId.length > 128) {
            return json({ message: "Mã tài khoản hoặc nhóm Zalo không hợp lệ." }, 400);
          }
          const directory = await requestDraftMapping(
            `/api/internal/zyro-mapping/groups/${encodeURIComponent(connectionId)}/${encodeURIComponent(groupId)}/members`,
          );
          return json(directory);
        }

        if (req.method === "GET" && isZaloMappingRegistrations) {
          const { data, error, count } = await supabase
            .from("zyro_registrations")
            .select("id,created_at,zalo_name,duration,gender,position,level,goal,email,status,zalo_user_id,zalo_group_id,zalo_connection_id,zalo_mapping_status,zalo_mapped_at,zalo_mapped_by", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(0, 999);
          if (error) throw error;
          const registrations = (data ?? []).map(mapZaloMappingRegistration);
          const total = count ?? registrations.length;
          return json({ registrations, total, truncated: total > registrations.length });
        }

        if (req.method === "POST" && isZaloMappingSync) {
          const body = await req.json().catch(() => null);
          const connectionId = text(body?.connectionId, 128);
          const groupId = text(body?.groupId, 128);
          const rawProfiles = Array.isArray(body?.profiles) ? body.profiles : [];
          const profiles = rawProfiles.map((item: any) => ({
            registrationId: text(item?.registrationId, 36),
            zaloUserId: text(item?.zaloUserId, 128),
            allowRemap: item?.allowRemap === true,
          }));
          const registrationIds = profiles.map((item: any) => item.registrationId);
          const zaloUserIds = profiles.map((item: any) => item.zaloUserId);
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

          if (!connectionId || !groupId || profiles.length < 1 || profiles.length > 200 ||
              profiles.some((item: any) => !uuidPattern.test(item.registrationId) || !item.zaloUserId) ||
              new Set(registrationIds).size !== registrationIds.length ||
              new Set(zaloUserIds).size !== zaloUserIds.length) {
            return json({ message: "Danh sách mapping không hợp lệ. Mỗi lần đồng bộ cần từ 1 đến 200 hồ sơ, UID và mã đăng ký không được trống hoặc trùng." }, 400);
          }

          const directory = await requestDraftMapping(
            `/api/internal/zyro-mapping/groups/${encodeURIComponent(connectionId)}/${encodeURIComponent(groupId)}/members`,
          );
          if (directory?.isComplete !== true) {
            return json({ message: "Danh bạ thành viên Zalo chưa đầy đủ. Chưa lưu mapping hoặc đồng bộ hồ sơ." }, 409);
          }
          if (directory.connectionId !== connectionId || directory.groupId !== groupId || !Array.isArray(directory.members)) {
            throw mappingError("Draft trả về danh bạ không khớp tài khoản hoặc nhóm đã chọn.", 502);
          }

          const directoryIds = directory.members
            .map((member: any) => text(member?.zaloUserId, 128))
            .filter(Boolean);
          const directoryIdSet = new Set(directoryIds);
          if (directoryIdSet.size !== directoryIds.length) {
            throw mappingError("Danh bạ Zalo có UID trùng. Draft chưa thể xác minh mapping an toàn.", 502);
          }
          if (zaloUserIds.some((uid: string) => !directoryIdSet.has(uid))) {
            return json({ message: "Có UID không thuộc nhóm Zalo đã chọn. Chưa lưu mapping hoặc đồng bộ hồ sơ." }, 409);
          }

          const { data: registrations, error: registrationError } = await supabase
            .from("zyro_registrations")
            .select("id,zalo_name,gender,position,level,zalo_user_id,zalo_mapping_status")
            .in("id", registrationIds);
          if (registrationError) throw registrationError;
          if ((registrations ?? []).length !== profiles.length) {
            return json({ message: "Một hoặc nhiều hồ sơ đăng ký không còn tồn tại. Hãy tải lại danh sách trước khi đồng bộ." }, 404);
          }

          const registrationById = new Map((registrations ?? []).map((item: any) => [item.id, item]));
          const remaps = profiles.filter((item: any) => {
            const current = registrationById.get(item.registrationId) as any;
            return current?.zalo_user_id && current.zalo_user_id !== item.zaloUserId;
          });
          if (remaps.some((item: any) => !item.allowRemap)) {
            return json({ message: "Hồ sơ đã có UID được lưu. Cần xác nhận rõ trước khi đổi UID mapping." }, 409);
          }

          const { data: existingMappings, error: existingMappingError } = await supabase
            .from("zyro_registrations")
            .select("id,zalo_user_id")
            .in("zalo_user_id", zaloUserIds);
          if (existingMappingError) throw existingMappingError;
          const duplicateMapping = (existingMappings ?? []).find((item: any) =>
            profiles.some((requested: any) => requested.zaloUserId === item.zalo_user_id && requested.registrationId !== item.id)
          );
          if (duplicateMapping) {
            return json({ message: "UID Zalo này đã được gắn với một hồ sơ Form khác. Hãy kiểm tra các đăng ký trùng trước khi đồng bộ." }, 409);
          }

          const mappedAt = new Date().toISOString();
          for (const item of profiles) {
            const { data: saved, error: saveError } = await supabase
              .from("zyro_registrations")
              .update({
                zalo_user_id: item.zaloUserId,
                zalo_group_id: groupId,
                zalo_connection_id: connectionId,
                zalo_mapping_status: "confirmed",
                zalo_mapped_at: mappedAt,
                zalo_mapped_by: ADMIN_USER,
              })
              .eq("id", item.registrationId)
              .select("id")
              .maybeSingle();
            if (saveError) throw saveError;
            if (!saved) throw mappingError("Không lưu được một mapping đã xác nhận. Hãy tải lại danh sách trước khi thử lại.", 409);
          }

          const draftProfiles = profiles.map((item: any) => {
            const registration = registrationById.get(item.registrationId) as any;
            return {
              zaloUserId: item.zaloUserId,
              gender: DRAFT_GENDER_BY_FORM[registration.gender] ?? null,
              role: DRAFT_ROLE_BY_FORM[registration.position] ?? null,
              level: DRAFT_LEVEL_BY_FORM[registration.level] ?? null,
            };
          });
          const draftResults = await requestDraftMapping("/api/internal/zyro-mapping/profiles/sync", {
            method: "POST",
            body: JSON.stringify({ connectionId, groupId, profiles: draftProfiles }),
          });
          const draftResultIds = Array.isArray(draftResults)
            ? draftResults.map((item: any) => text(item?.zaloUserId, 128))
            : [];
          if (!Array.isArray(draftResults) || draftResults.length !== profiles.length ||
              new Set(draftResultIds).size !== profiles.length ||
              zaloUserIds.some((uid: string) => !draftResultIds.includes(uid))) {
            throw mappingError("Draft đã nhận yêu cầu nhưng số kết quả không khớp. Mapping đã được lưu ở trạng thái xác nhận; hãy kiểm tra Draft trước khi thử lại.", 502);
          }

          const { data: syncedRows, error: syncStatusError } = await supabase
            .from("zyro_registrations")
            .update({ zalo_mapping_status: "synced" })
            .in("id", registrationIds)
            .select("id");
          if (syncStatusError || (syncedRows ?? []).length !== profiles.length) {
            throw mappingError("Draft đã đồng bộ hồ sơ nhưng chưa cập nhật được trạng thái mapping trên Form. Có thể tải lại và đồng bộ lại an toàn.", 503);
          }

          const resultByUid = new Map(draftResults.map((item: any) => [item.zaloUserId, item]));
          return json({
            ok: true,
            remappedCount: remaps.length,
            warning: remaps.length ? "UID cũ đã được thay bằng UID mới; hồ sơ cũ trong Draft không tự bị xóa." : null,
            results: profiles.map((item: any) => {
              const result = resultByUid.get(item.zaloUserId) as any;
              return {
                registrationId: item.registrationId,
                zaloUserId: item.zaloUserId,
                displayName: result?.displayName ?? "",
                status: result?.status ?? "unknown",
                preservedFields: Array.isArray(result?.preservedFields) ? result.preservedFields : [],
              };
            }),
          });
        }

        return json({ message: "Phương thức không được hỗ trợ cho API mapping." }, 405);
      } catch (error) {
        const status = Number((error as any)?.status);
        const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
        return json({ message: error instanceof Error ? error.message : "Không xử lý được yêu cầu mapping." }, safeStatus);
      }
    }

    if (req.method === "GET" && isHealth) {
      return json({ ok: true });
    }

    if (req.method === "GET" && isEmailSettings) {
      if (!(await isAdmin(req))) return unauthorized();
      return json({ authorized: true });
    }



    if (req.method === "GET" && isConfig) {
      return json(await getConfigRow());
    }

    if (req.method === "PATCH" && isConfig) {
      if (!(await isAdmin(req))) return unauthorized();
      const body = await req.json();
      const clean = sanitizeConfig(body?.config ?? body);
      const { data, error } = await supabase
        .from("zyro_site_config")
        .update({ data: clean, updated_at: new Date().toISOString() })
        .eq("id", "main")
        .select("data,updated_at")
        .single();
      if (error) throw error;
      return json({ config: sanitizeConfig(data.data), updatedAt: data.updated_at });
    }

    if (req.method === "POST" && isRegistrations) {
      const body = await req.json();
      const { config } = await getConfigRow();
      const options = config?.formOptions ?? {};
      const allowed = (key: keyof typeof options) => new Set((Array.isArray(options[key]) ? options[key] : []).map((item: any) => item.id));

      const zaloName = text(body?.zaloName, 80);
      const goal = text(body?.goal, 500);
      const hasEmail = Object.prototype.hasOwnProperty.call(body ?? {}, "email");
      const email = text(body?.email, 254).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ message: "Địa chỉ email chưa đúng định dạng." }, 400);
      }

      if (
        zaloName.length < 2 ||
        goal.length < 3 ||
        !allowed("duration").has(body?.duration) ||
        !allowed("gender").has(body?.gender) ||
        !allowed("position").has(body?.position) ||
        !allowed("level").has(body?.level)
      ) {
        return json({ message: "Kiểm tra lại thông tin đăng ký." }, 400);
      }

      const { data, error } = await supabase
        .from("zyro_registrations")
        .insert({
          zalo_name: zaloName,
          duration: body.duration,
          gender: body.gender,
          position: body.position,
          level: body.level,
          goal,
          email: email || null,
          status: "new"
        })
        .select("id")
        .single();

      if (error) throw error;
      return json({ id: data.id }, 201);
    }

    if (
      (req.method === "GET" && isRegistrations) ||
      (req.method === "POST" && decisionMatch) ||
      (req.method === "PATCH" && registrationMatch) ||
      (req.method === "DELETE" && registrationMatch) ||
      (req.method === "PATCH" && isBulkRegistrations)
    ) {
      if (!(await isAdmin(req))) return unauthorized();
    }

    if (req.method === "GET" && isRegistrations) {
      const page = clampInt(url.searchParams.get("page"), 1, 100000, 1);
      const pageSize = clampInt(url.searchParams.get("pageSize"), 10, 100, 25);
      const status = ["new", "approved", "rejected"].includes(url.searchParams.get("status") ?? "")
        ? url.searchParams.get("status")
        : "all";
      const sort = url.searchParams.get("sort") === "oldest" ? "oldest" : "newest";
      const search = safeSearch(url.searchParams.get("search"));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("zyro_registrations")
        .select("id,created_at,zalo_name,duration,gender,position,level,goal,email,status", { count: "exact" })
        .order("created_at", { ascending: sort === "oldest" })
        .range(from, to);

      if (status !== "all") query = query.eq("status", status);
      if (search) query = query.ilike("zalo_name", `%${search}%`);

      const [{ data, error, count }, counts] = await Promise.all([
        query,
        getRegistrationCounts()
      ]);

      if (error) throw error;

      const total = count ?? 0;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return json({
        registrations: (data ?? []).map(mapRegistration),
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          from: total === 0 ? 0 : from + 1,
          to: Math.min(from + (data?.length ?? 0), total)
        },
        counts
      });
    }

    if (req.method === "PATCH" && isBulkRegistrations) {
      const body = await req.json();
      const ids = Array.isArray(body?.ids)
        ? [...new Set(body.ids.filter((id: unknown) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100)
        : [];
      const status = body?.status;

      if (!ids.length) return json({ message: "Chưa chọn đăng ký nào." }, 400);
      if (status !== "new") {
        return json({ message: "Duyệt hoặc từ chối từng hồ sơ để chọn nội dung email phù hợp." }, 400);
      }

      const { data, error } = await supabase
        .from("zyro_registrations")
        .update({ status })
        .in("id", ids)
        .select("id");

      if (error) throw error;
      return json({ ok: true, updated: data?.length ?? 0 });
    }


    if (req.method === "POST" && decisionMatch) {
      const registrationId = decisionMatch[1];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId)) {
        return json({ message: "Mã đăng ký không hợp lệ." }, 400);
      }

      const body = await req.json();
      const hasEmail = Object.prototype.hasOwnProperty.call(body ?? {}, "email");
      const status = body?.status;
      if (!["approved", "rejected"].includes(status)) {
        return json({ message: "Quyết định không hợp lệ." }, 400);
      }

      const email = text(body?.email, 254).toLowerCase();
      const sendEmail = body?.sendEmail === true;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ message: "Địa chỉ email chưa đúng định dạng." }, 400);
      }
      if (sendEmail && !email) {
        return json({ message: "Nhập địa chỉ email hợp lệ trước khi gửi." }, 400);
      }

      const { data: registration, error: registrationError } = await supabase
        .from("zyro_registrations")
        .select("id,created_at,zalo_name,duration,gender,position,level,goal,email,status")
        .eq("id", registrationId)
        .maybeSingle();
      if (registrationError) throw registrationError;
      if (!registration) return json({ message: "Không tìm thấy hồ sơ đăng ký." }, 404);

      const { config } = await getConfigRow();
      const isApproval = status === "approved";
      const mode = !isApproval && body?.emailMode === "custom" ? "custom" : "template";
      let template = isApproval ? config.emailTemplates.approved : config.emailTemplates.rejected;
      let subject = template.subject;
      let bodyHtml = template.bodyHtml;
      const providedReason = text(body?.reason, 700);
      let reason = providedReason;
      if (sendEmail && !isApproval && mode === "template") {
        try {
          reason = resolveRejectionReason(providedReason);
        } catch {
          return json({ message: "Lý do riêng cần có ít nhất 5 ký tự. Hoặc để trống để dùng lý do mặc định." }, 400);
        }
      }
      if (sendEmail && !isApproval && mode === "template" && !template.bodyHtml.includes("{{reason}}")) {
        return json({ message: "Mẫu từ chối cần có biến {{reason}} để chèn lý do riêng." }, 400);
      }

      if (isApproval || mode === "custom") {
        const requestedSubject = text(body?.subject, 180).replace(/[\r\n]+/g, " ");
        const requestedBody = sanitizeEmailHtml(body?.bodyHtml);
        if (sendEmail && (!requestedSubject || !requestedBody)) {
          return json({ message: "Email cần có tiêu đề và nội dung hợp lệ trước khi gửi." }, 400);
        }
        subject = requestedSubject || template.subject;
        bodyHtml = requestedBody || template.bodyHtml;
      }

      if (!isApproval && mode === "custom") {
        template = { ...config.emailTemplates.rejected, title: "Phản hồi từ Ban quản trị ZYRO" };
        if (sendEmail && (!text(body?.subject, 180) || !bodyHtml)) {
          return json({ message: "Email riêng cần có tiêu đề và nội dung." }, 400);
        }
      }

      let providerMessageId = "";
      let emailSent = false;
      if (sendEmail) {
        const html = renderDecisionEmail(config, template, registration, reason, bodyHtml);
        const idempotencyKey = "zyro-" + await sha256(registrationId + ":" + status + ":" + email + ":" + subject + ":" + html);

        let outbox: any;
        try {
          outbox = await getOrCreateDecisionEmailOutbox(idempotencyKey, registrationId, status);
        } catch (outboxError) {
          console.error("Unable to reserve decision email outbox record", outboxError);
          return json({ message: "Không thể ghi nhận trạng thái gửi email nên hệ thống chưa gửi thư. Vui lòng thử lại sau." }, 503);
        }

        if (outbox.registration_id !== registrationId || outbox.decision_status !== status) {
          return json({ message: "Mã chống gửi trùng đang gắn với một quyết định khác. Hãy tải lại hồ sơ trước khi xử lý tiếp." }, 409);
        }

        if (outbox.delivery_status === "sent") {
          if (!outbox.provider_message_id) {
          return json({ message: "Bản ghi gửi email thiếu mã xác nhận từ Google Apps Script. Hệ thống tạm dừng để tránh gửi trùng; hãy kiểm tra Gmail mục Đã gửi của tài khoản triển khai Apps Script." }, 409);
          }
          providerMessageId = outbox.provider_message_id;
          emailSent = true;
        } else if (outbox.delivery_status === "uncertain") {
          return json({ message: "Yêu cầu gửi email trước đó chưa xác định được kết quả. Hệ thống tạm dừng gửi lại để tránh gửi trùng; hãy kiểm tra Gmail mục Đã gửi của tài khoản triển khai Apps Script trước khi xử lý tiếp." }, 409);
        } else if (outbox.delivery_status !== "pending") {
          return json({ message: "Trạng thái gửi email không hợp lệ. Hệ thống tạm dừng để tránh gửi trùng." }, 409);
        } else {
          const createdAt = Date.parse(outbox.created_at);
          if (!Number.isFinite(createdAt) || Date.now() - createdAt >= MAIL_IDEMPOTENCY_WINDOW_MS) {
            try {
              await markDecisionEmailOutboxUncertain(idempotencyKey);
            } catch (stateError) {
              console.error("Unable to mark stale decision email as uncertain", stateError);
            }
            return json({ message: "Yêu cầu gửi email trước đó đã quá thời hạn chống gửi trùng an toàn. Hệ thống không tự gửi lại; hãy kiểm tra Gmail mục Đã gửi của tài khoản triển khai Apps Script trước khi quyết định tiếp." }, 409);
          }

          try {
            providerMessageId = await sendDecisionEmail(email, subject, html, idempotencyKey, req.headers.get("authorization") ?? "");
          } catch (mailError) {
            const deliveryStatus = (mailError as any)?.deliveryStatus === "uncertain" ? "uncertain" : "pending";
            if (deliveryStatus === "uncertain") {
              try {
                await markDecisionEmailOutboxUncertain(idempotencyKey);
              } catch (stateError) {
              console.error("Unable to mark uncertain Google Apps Script delivery", stateError);
              }
            }
            return json({
              message: mailError instanceof Error ? mailError.message : "Không gửi được email qua Google Apps Script.",
              emailSent: false,
              deliveryStatus
            }, 503);
          }

          try {
            await markDecisionEmailOutboxSent(idempotencyKey, providerMessageId);
          } catch (stateError) {
            console.error("Google Apps Script accepted email but outbox confirmation could not be saved", stateError);
            return json({
              message: `Google Apps Script đã tiếp nhận email (mã ${providerMessageId}) nhưng hệ thống chưa lưu được trạng thái gửi. Hãy giữ nguyên email và nội dung rồi xử lý lại trong 23 giờ; hệ thống sẽ dùng cùng mã chống gửi trùng.`,
              emailSent: true,
              providerMessageId,
              deliveryStatus: "pending"
            }, 503);
          }
          emailSent = true;
        }
      }

      const update: Record<string, unknown> = { status };
      if (hasEmail) update.email = email || null;
      const { data: updatedRegistration, error: updateError } = await supabase
        .from("zyro_registrations")
        .update(update)
        .eq("id", registrationId)
        .select("id")
        .maybeSingle();
      if (updateError) {
        if (emailSent) {
          console.error("Email was accepted by Google Apps Script but registration decision could not be saved", updateError);
          return json({
            message: `Google Apps Script đã tiếp nhận email (mã ${providerMessageId}) nhưng trạng thái hồ sơ chưa cập nhật. Hãy mở lại hồ sơ và thực hiện lại cùng quyết định, giữ nguyên email và nội dung; hệ thống sẽ không gửi lại email.`,
            emailSent: true,
            providerMessageId
          }, 503);
        }
        throw updateError;
      }
      if (!updatedRegistration) {
        if (emailSent) {
          return json({ message: `Email đã được gửi (mã ${providerMessageId}) nhưng hồ sơ không còn tồn tại để cập nhật. Không gửi lại email.`, emailSent: true, providerMessageId }, 409);
        }
        return json({ message: "Không tìm thấy hồ sơ để cập nhật trạng thái." }, 404);
      }

      return json({
        ok: true,
        status,
        email: hasEmail ? email : registration.email || "",
        emailSent,
        providerMessageId: providerMessageId || null
      });
    }

    if (req.method === "PATCH" && registrationMatch) {
      const body = await req.json();
      if (body?.status !== "new") {
        return json({ message: "Dùng hộp soạn email để duyệt hoặc từ chối hồ sơ." }, 400);
      }
      const { error } = await supabase
        .from("zyro_registrations")
        .update({ status: body.status })
        .eq("id", registrationMatch[1]);
      if (error) throw error;
      return json({ ok: true });
    }

    if (req.method === "DELETE" && registrationMatch) {
      const registrationId = registrationMatch[1];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId)) {
        return json({ message: "Mã đăng ký không hợp lệ." }, 400);
      }

      const { data, error } = await supabase
        .from("zyro_registrations")
        .delete()
        .eq("id", registrationId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) return json({ message: "Không tìm thấy đăng ký." }, 404);
      return json({ ok: true, deletedId: data.id });
    }

    return json({ message: "Not found" }, 404);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : "Server error" }, 500);
  }
});

