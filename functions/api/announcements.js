const DATABASE_KEY = "database";
const RETIRED_SEEDED_PLAYER_USER_KEYS = ["easoneason"];
const EMPTY_DATABASE = {
  version: 1,
  users: {},
  publicHints: [],
  publicAnnouncements: [],
  deletedUserKeys: [...RETIRED_SEEDED_PLAYER_USER_KEYS],
  deletedPublicHintIds: [],
  deletedPublicAnnouncementIds: [],
};
const PREFERRED_DATABASE_BINDINGS = [
  "PUZZLE_HUNT_D1",
  "PUZZLEHUNT_D1",
  "PUZZLE_HUNT_DB",
  "PUZZLEHUNT_DB",
  "PUZZLE_HUNT_DATABASE",
  "DATABASE",
  "DB",
  "D1",
];
const PREFERRED_KV_BINDINGS = ["PUZZLE_HUNT_KV", "PUZZLEHUNT_KV", "PUZZLE_HUNT_DATABASE", "DATABASE", "KV"];
const PREFERRED_R2_BINDINGS = ["PUZZLE_HUNT_R2", "PUZZLEHUNT_R2", "PUZZLE_HUNT_BUCKET", "DATABASE_BUCKET", "BUCKET", "R2"];

function isD1Database(binding) { return Boolean(binding && typeof binding.prepare === "function"); }
function isKvNamespace(binding) { return Boolean(binding && typeof binding.get === "function" && typeof binding.put === "function"); }
function isR2Bucket(binding) { return Boolean(binding && typeof binding.get === "function" && typeof binding.put === "function" && typeof binding.head === "function"); }
function findBinding(env = {}, names, predicate) {
  for (const name of names) if (predicate(env[name])) return env[name];
  return Object.values(env).find(predicate) || null;
}
function itemIdKey(value) { return value?.toString().trim() || ""; }
function userKey(value) { return value?.toString().trim().toLowerCase() || ""; }

function cleanDatabase(database) {
  const retiredKeys = new Set(RETIRED_SEEDED_PLAYER_USER_KEYS);
  const sourceUsers = database?.users && typeof database.users === "object" ? database.users : {};
  const users = {};
  for (const [key, user] of Object.entries(sourceUsers)) {
    if (retiredKeys.has(userKey(key)) || retiredKeys.has(userKey(user?.username))) continue;
    users[key] = user;
  }
  const deletedPublicHintIds = Array.from(new Set((Array.isArray(database?.deletedPublicHintIds) ? database.deletedPublicHintIds : []).map(itemIdKey).filter(Boolean)));
  const deletedPublicAnnouncementIds = Array.from(new Set((Array.isArray(database?.deletedPublicAnnouncementIds) ? database.deletedPublicAnnouncementIds : []).map(itemIdKey).filter(Boolean)));
  const deletedPublicHintSet = new Set(deletedPublicHintIds);
  const deletedPublicAnnouncementSet = new Set(deletedPublicAnnouncementIds);

  return {
    version: 1,
    users,
    publicHints: (Array.isArray(database?.publicHints) ? database.publicHints : []).filter((hint) => !deletedPublicHintSet.has(itemIdKey(hint?.id))),
    publicAnnouncements: (Array.isArray(database?.publicAnnouncements) ? database.publicAnnouncements : []).filter((announcement) => !deletedPublicAnnouncementSet.has(itemIdKey(announcement?.id))),
    deletedUserKeys: Array.from(new Set([...(Array.isArray(database?.deletedUserKeys) ? database.deletedUserKeys : []), ...RETIRED_SEEDED_PLAYER_USER_KEYS].map(userKey).filter(Boolean))),
    deletedPublicHintIds,
    deletedPublicAnnouncementIds,
  };
}

function createKvDriver(store) {
  return {
    type: "KV",
    async get() { return cleanDatabase(await store.get(DATABASE_KEY, { type: "json" }) || EMPTY_DATABASE); },
    async put(database) {
      await store.put(DATABASE_KEY, JSON.stringify(cleanDatabase(database)));
      return cleanDatabase(await store.get(DATABASE_KEY, { type: "json" }) || database);
    },
  };
}
function createR2Driver(bucket) {
  return {
    type: "R2",
    async get() {
      const object = await bucket.get(`${DATABASE_KEY}.json`);
      if (!object) return cleanDatabase(EMPTY_DATABASE);
      return cleanDatabase(await object.json().catch(() => EMPTY_DATABASE));
    },
    async put(database) {
      const clean = cleanDatabase(database);
      await bucket.put(`${DATABASE_KEY}.json`, JSON.stringify(clean), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
      const confirmed = await bucket.get(`${DATABASE_KEY}.json`);
      return cleanDatabase(confirmed ? await confirmed.json().catch(() => clean) : clean);
    },
  };
}
function createD1Driver(database) {
  return {
    type: "D1",
    async get() {
      await database.prepare("CREATE TABLE IF NOT EXISTS puzzle_hunt_database (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
      const row = await database.prepare("SELECT data FROM puzzle_hunt_database WHERE id = ?").bind(DATABASE_KEY).first();
      if (!row?.data) return cleanDatabase(EMPTY_DATABASE);
      return cleanDatabase(JSON.parse(row.data || "null") || EMPTY_DATABASE);
    },
    async put(incomingDatabase) {
      const clean = cleanDatabase(incomingDatabase);
      await database.prepare("CREATE TABLE IF NOT EXISTS puzzle_hunt_database (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
      await database.prepare("INSERT INTO puzzle_hunt_database (id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
        .bind(DATABASE_KEY, JSON.stringify(clean), new Date().toISOString())
        .run();
      const row = await database.prepare("SELECT data FROM puzzle_hunt_database WHERE id = ?").bind(DATABASE_KEY).first();
      return cleanDatabase(row?.data ? JSON.parse(row.data || "null") || clean : clean);
    },
  };
}
function getDatabaseDriver(env = {}) {
  const d1 = findBinding(env, PREFERRED_DATABASE_BINDINGS, isD1Database);
  if (d1) return createD1Driver(d1);
  const kv = findBinding(env, PREFERRED_KV_BINDINGS, isKvNamespace);
  if (kv) return createKvDriver(kv);
  const r2 = findBinding(env, PREFERRED_R2_BINDINGS, isR2Bucket);
  if (r2) return createR2Driver(r2);
  return null;
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function sanitizePublicAnnouncement(announcement) {
  if (!announcement || typeof announcement !== "object") return null;
  const content = (announcement.content ?? "").toString().trim();
  if (!content) return null;
  return {
    id: itemIdKey(announcement.id) || crypto.randomUUID(),
    content,
    createdAt: announcement.createdAt || new Date().toISOString(),
    seenBy: Array.isArray(announcement.seenBy) ? announcement.seenBy.map(userKey).filter(Boolean) : [],
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return jsonResponse({ ok: true });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  const driver = getDatabaseDriver(env);
  if (!driver) {
    return jsonResponse({ ok: false, error: "Missing writable Cloudflare database binding." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const content = (body?.content ?? "").toString().trim();
  const adminUsername = userKey(body?.adminUsername || "");
  if (!content) return jsonResponse({ ok: false, error: "Announcement content is required." }, { status: 400 });

  const announcement = sanitizePublicAnnouncement({ content, createdAt: new Date().toISOString(), seenBy: adminUsername ? [adminUsername] : [] });
  if (!announcement) return jsonResponse({ ok: false, error: "Unable to create announcement." }, { status: 400 });

  const database = await driver.get();
  database.publicAnnouncements = Array.isArray(database.publicAnnouncements) ? database.publicAnnouncements : [];
  database.publicAnnouncements.push(announcement);
  const saved = await driver.put(database);
  return jsonResponse({ ok: true, announcement, database: saved }, { headers: { "X-Puzzle-Hunt-Store": driver.type } });
}
