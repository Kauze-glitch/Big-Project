import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getZaloCandidates, mapFormProfileToDraft, normalizeZaloName } from "../public/zalo-mapping-core.js";

const root = new URL("../", import.meta.url);

const members = [
  { zaloUserId: "uid-1", displayName: "Thanh Long", zaloName: "Thanh Long", avatarUrl: "avatar-1" },
  { zaloUserId: "uid-2", displayName: "Nguyễn An", zaloName: "Nguyễn An", avatarUrl: "avatar-2" },
  { zaloUserId: "uid-3", displayName: "Thanh Long", zaloName: "Long Thanh", avatarUrl: "avatar-3" },
];

test("normalizes case and whitespace without treating missing Vietnamese accents as an exact match", () => {
  assert.equal(normalizeZaloName("  THANH   LONG "), "thanh long");
  const result = getZaloCandidates({ zaloName: "thanh long" }, members.slice(0, 1));
  assert.equal(result.status, "exact");
  assert.equal(result.selectedUid, "uid-1");
});

test("auto-selects only one exact Zalo name match", () => {
  const result = getZaloCandidates({ zaloName: "Thanh Long" }, members.slice(0, 1));
  assert.equal(result.status, "exact");
  assert.equal(result.selectedUid, "uid-1");
  assert.equal(result.needsConfirmation, false);
});

test("duplicate exact names are shown as candidates and never auto-selected", () => {
  const result = getZaloCandidates({ zaloName: "Thanh Long" }, members);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.selectedUid, "");
  assert.equal(result.needsConfirmation, true);
  assert.deepEqual(result.candidates.map((member) => member.zaloUserId), ["uid-1", "uid-3"]);
});

test("similar names are suggestions only and require administrator confirmation", () => {
  const result = getZaloCandidates({ zaloName: "Thanh Lon" }, members.slice(0, 1));
  assert.equal(result.status, "similar");
  assert.equal(result.selectedUid, "");
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.candidates[0].zaloUserId, "uid-1");
});

test("a saved UID is retained when it still exists even if the Zalo display name changed", () => {
  const result = getZaloCandidates({ zaloName: "A completely new name", zaloUserId: "uid-1" }, members);
  assert.equal(result.status, "saved");
  assert.equal(result.selectedUid, "uid-1");
  assert.equal(result.candidates[0].displayName, "Thanh Long");
});

test("a saved UID missing from the selected group is stale and cannot be replaced automatically by a name match", () => {
  const result = getZaloCandidates({ zaloName: "Nguyễn An", zaloUserId: "uid-old" }, members);
  assert.equal(result.status, "stale");
  assert.equal(result.selectedUid, "");
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.candidates[0].zaloUserId, "uid-2");
});

test("maps Form enum values to the exact Draft enum names", () => {
  assert.deepEqual(mapFormProfileToDraft({ gender: "male", position: "attacker", level: "newbie" }), {
    gender: "Male",
    role: "Attack",
    level: "New",
  });
  assert.deepEqual(mapFormProfileToDraft({ gender: "female", position: "allrounder", level: "good" }), {
    gender: "Female",
    role: "FullStack",
    level: "Good",
  });
  assert.deepEqual(mapFormProfileToDraft({ gender: "unknown", position: "unknown", level: "unknown" }), {
    gender: null,
    role: null,
    level: null,
  });
});

test("migration adds persistent mapping columns without imposing a unique UID constraint", async () => {
  const sql = await readFile(new URL("supabase/migrations/20261103160715_zyro_registration_zalo_mapping.sql", root), "utf8");
  for (const column of ["zalo_user_id", "zalo_group_id", "zalo_connection_id", "zalo_mapping_status", "zalo_mapped_at", "zalo_mapped_by"]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}\\b`, "i"));
  }
  assert.match(sql, /check \(zalo_mapping_status in \('unmapped', 'confirmed', 'synced'\)\)/i);
  assert.match(sql, /create index if not exists zyro_registrations_zalo_user_id_idx/i);
  assert.doesNotMatch(sql, /create unique index/i);
});

test("mapping endpoints remain behind Admin auth and the Draft shared key stays server-side", async () => {
  const [server, edge, admin] = await Promise.all([
    readFile(new URL("server.js", root), "utf8"),
    readFile(new URL("supabase/functions/zyro-api/index.ts", root), "utf8"),
    readFile(new URL("public/admin.js", root), "utf8"),
  ]);
  assert.match(server, /app\.get\("\/api\/admin\/zalo-mapping\/groups", requireAdmin/);
  assert.match(server, /app\.get\("\/api\/admin\/zalo-mapping\/registrations", requireAdmin/);
  assert.match(server, /app\.post\("\/api\/admin\/zalo-mapping\/sync", requireAdmin/);
  assert.match(edge, /Deno\.env\.get\("DRAFT_API_BASE_URL"\)/);
  assert.match(edge, /Deno\.env\.get\("ZYRO_MAPPING_INTERNAL_KEY"\)/);
  assert.match(edge, /if \(isZaloMappingPath\) \{\s*if \(!\(await isAdmin\(req\)\)\) return unauthorized\(\);/);
  assert.doesNotMatch(admin, /ZYRO_MAPPING_INTERNAL_KEY|x-zyro-mapping-key/);
});

test("mapping reads all registration statuses and sync validates a complete live directory before saving UIDs", async () => {
  const edge = await readFile(new URL("supabase/functions/zyro-api/index.ts", root), "utf8");
  const readStart = edge.indexOf('if (req.method === "GET" && isZaloMappingRegistrations)');
  const readEnd = edge.indexOf('if (req.method === "POST" && isZaloMappingSync)', readStart);
  assert.notEqual(readStart, -1);
  assert.notEqual(readEnd, -1);
  const readHandler = edge.slice(readStart, readEnd);
  assert.match(readHandler, /\.from\("zyro_registrations"\)/);
  assert.doesNotMatch(readHandler, /\.eq\("status"/);

  const syncStart = readEnd;
  const syncEnd = edge.indexOf('return json({ message: "Phương thức không được hỗ trợ cho API mapping." }, 405);', syncStart);
  const syncHandler = edge.slice(syncStart, syncEnd);
  assert.match(syncHandler, /directory\?\.isComplete !== true/);
  assert.match(syncHandler, /directoryIdSet\.has\(uid\)/);
  assert.match(syncHandler, /new Set\(zaloUserIds\)\.size !== zaloUserIds\.length/);
  assert.match(syncHandler, /zalo_mapping_status: "confirmed"/);
  assert.match(syncHandler, /zalo_mapping_status: "synced"/);
  assert.doesNotMatch(syncHandler, /\.eq\("status"/);
});