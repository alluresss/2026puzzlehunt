const DATABASE_KEY = "database";
const RETIRED_SEEDED_PLAYER_USER_KEYS = ["easoneason"];
const EMPTY_DATABASE = { version: 1, users: {}, publicHints: [], deletedUserKeys: [...RETIRED_SEEDED_PLAYER_USER_KEYS] };
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

function isD1Database(binding) {
  return Boolean(binding && typeof binding.prepare === "function");
}

function isKvNamespace(binding) {
  return Boolean(binding && typeof binding.get === "function" && typeof binding.put === "function");
}

function isR2Bucket(binding) {
  return Boolean(binding && typeof binding.get === "function" && typeof binding.put === "function" && typeof binding.head === "function");
}

function findBinding(env = {}, names, predicate) {
  for (const name of names) {
    if (predicate(env[name])) return env[name];
  }

  return Object.values(env).find(predicate) || null;
}

function createKvDriver(store) {
  return {
    type: "KV",
    async get() {
      return cleanDatabase(await store.get(DATABASE_KEY, { type: "json" }) || EMPTY_DATABASE);
    },
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
      await bucket.put(`${DATABASE_KEY}.json`, JSON.stringify(clean), {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      });
      const confirmed = await bucket.get(`${DATABASE_KEY}.json`);
      return cleanDatabase(confirmed ? await confirmed.json().catch(() => clean) : clean);
    },
  };
}

function createD1Driver(database) {
  return {
    type: "D1",
    async get() {
      await database.prepare(
        "CREATE TABLE IF NOT EXISTS puzzle_hunt_database (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)"
      ).run();
      const row = await database.prepare("SELECT data FROM puzzle_hunt_database WHERE id = ?")
        .bind(DATABASE_KEY)
        .first();
      if (!row?.data) return cleanDatabase(EMPTY_DATABASE);
      return cleanDatabase(JSON.parse(row.data || "null") || EMPTY_DATABASE);
    },
    async put(incomingDatabase) {
      const clean = cleanDatabase(incomingDatabase);
      await database.prepare(
        "CREATE TABLE IF NOT EXISTS puzzle_hunt_database (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)"
      ).run();
      await database.prepare(
        "INSERT INTO puzzle_hunt_database (id, data, updated_at) VALUES (?, ?, ?) "
        + "ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
      )
        .bind(DATABASE_KEY, JSON.stringify(clean), new Date().toISOString())
        .run();
      const row = await database.prepare("SELECT data FROM puzzle_hunt_database WHERE id = ?")
        .bind(DATABASE_KEY)
        .first();
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
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Content-Type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function userKey(value) {
  return value?.toString().trim().toLowerCase() || "";
}

function cleanDatabase(database) {
  const retiredKeys = new Set(RETIRED_SEEDED_PLAYER_USER_KEYS);
  const sourceUsers = database?.users && typeof database.users === "object" ? database.users : {};
  const users = {};

  for (const [key, user] of Object.entries(sourceUsers)) {
    if (retiredKeys.has(userKey(key)) || retiredKeys.has(userKey(user?.username))) continue;
    users[key] = user;
  }

  return {
    version: 1,
    users,
    publicHints: Array.isArray(database?.publicHints) ? database.publicHints : [],
    deletedUserKeys: Array.from(new Set([
      ...(Array.isArray(database?.deletedUserKeys) ? database.deletedUserKeys : []),
      ...RETIRED_SEEDED_PLAYER_USER_KEYS,
    ].map(userKey).filter(Boolean))),
  };
}

function newerTimestamp(a, b) {
  const aTime = Date.parse(a || "");
  const bTime = Date.parse(b || "");
  if (Number.isNaN(aTime) && Number.isNaN(bTime)) return "";
  if (Number.isNaN(aTime)) return b || "";
  if (Number.isNaN(bTime)) return a || "";
  return aTime >= bTime ? (a || "") : (b || "");
}

function olderTimestamp(a, b) {
  const aTime = Date.parse(a || "");
  const bTime = Date.parse(b || "");
  if (Number.isNaN(aTime) && Number.isNaN(bTime)) return "";
  if (Number.isNaN(aTime)) return b || "";
  if (Number.isNaN(bTime)) return a || "";
  return aTime <= bTime ? (a || "") : (b || "");
}

function mergeProgress(localProgress = {}, incomingProgress = {}) {
  const localSolved = Array.isArray(localProgress.solvedIds) ? localProgress.solvedIds : [];
  const incomingSolved = Array.isArray(incomingProgress.solvedIds) ? incomingProgress.solvedIds : [];
  const solvedIds = Array.from(new Set([...localSolved, ...incomingSolved].map(Number).filter(Number.isFinite)));
  const solvedAtById = {};

  for (const id of solvedIds) {
    const key = String(id);
    solvedAtById[key] = olderTimestamp(localProgress.solvedAtById?.[key], incomingProgress.solvedAtById?.[key])
      || localProgress.solvedAtById?.[key]
      || incomingProgress.solvedAtById?.[key]
      || new Date().toISOString();
  }

  return {
    unlockedUpTo: Math.max(Number(localProgress.unlockedUpTo) || 0, Number(incomingProgress.unlockedUpTo) || 0),
    solvedIds,
    solvedAtById,
  };
}

function mergeArrayById(localItems, incomingItems, mergeItem) {
  const byId = new Map();
  [...(Array.isArray(localItems) ? localItems : []), ...(Array.isArray(incomingItems) ? incomingItems : [])]
    .filter((item) => item && typeof item === "object" && item.id)
    .forEach((item) => {
      const existing = byId.get(item.id);
      byId.set(item.id, existing ? mergeItem(existing, item) : item);
    });
  return Array.from(byId.values());
}

function mergeHintRequests(localRequests, incomingRequests) {
  return mergeArrayById(localRequests, incomingRequests, (local, incoming) => {
    const latestDecision = newerTimestamp(local.decidedAt, incoming.decidedAt);
    return {
      ...local,
      ...incoming,
      progressText: incoming.progressText || local.progressText,
      responseText: incoming.responseText || local.responseText,
      status: latestDecision === incoming.decidedAt ? incoming.status : local.status,
      createdAt: olderTimestamp(local.createdAt, incoming.createdAt) || local.createdAt || incoming.createdAt,
      decidedAt: latestDecision,
      seenByUser: Boolean(local.seenByUser && incoming.seenByUser),
    };
  });
}

function mergePuzzleStats(localStats = {}, incomingStats = {}) {
  const ids = new Set([...Object.keys(localStats || {}), ...Object.keys(incomingStats || {})]);
  return Object.fromEntries(Array.from(ids).map((id) => {
    const local = localStats?.[id] || {};
    const incoming = incomingStats?.[id] || {};
    return [id, {
      ...local,
      ...incoming,
      firstOpenedAt: olderTimestamp(local.firstOpenedAt, incoming.firstOpenedAt),
      lastOpenedAt: newerTimestamp(local.lastOpenedAt, incoming.lastOpenedAt),
    }];
  }));
}

function mergeUser(localUser, incomingUser) {
  if (!localUser) return incomingUser;
  if (!incomingUser) return localUser;

  const localUpdated = Date.parse(localUser.updatedAt || "");
  const incomingUpdated = Date.parse(incomingUser.updatedAt || "");
  const incomingIsNewer = !Number.isNaN(incomingUpdated) && (Number.isNaN(localUpdated) || incomingUpdated > localUpdated);
  const preferred = incomingIsNewer ? incomingUser : localUser;
  const fallback = incomingIsNewer ? localUser : incomingUser;

  return {
    ...fallback,
    ...preferred,
    username: preferred.username || fallback.username,
    passwordHash: preferred.passwordHash || fallback.passwordHash || "",
    isAdmin: Boolean(preferred.isAdmin || fallback.isAdmin),
    hiddenFromLeaderboard: Boolean(preferred.hiddenFromLeaderboard || fallback.hiddenFromLeaderboard),
    progress: mergeProgress(localUser.progress, incomingUser.progress),
    hintRequests: mergeHintRequests(localUser.hintRequests, incomingUser.hintRequests),
    puzzleStats: mergePuzzleStats(localUser.puzzleStats, incomingUser.puzzleStats),
    createdAt: olderTimestamp(localUser.createdAt, incomingUser.createdAt) || preferred.createdAt || fallback.createdAt,
    updatedAt: newerTimestamp(localUser.updatedAt, incomingUser.updatedAt) || preferred.updatedAt || fallback.updatedAt,
  };
}

function mergePublicHints(localHints, incomingHints) {
  return mergeArrayById(localHints, incomingHints, (local, incoming) => ({
    ...local,
    ...incoming,
    seenBy: Array.from(new Set([...(local.seenBy || []), ...(incoming.seenBy || [])])),
    createdAt: olderTimestamp(local.createdAt, incoming.createdAt) || local.createdAt || incoming.createdAt,
  }));
}

function isFreshAccountRecord(user) {
  if (!user || typeof user !== "object") return false;
  if (!user.createdAt || !user.updatedAt) return false;
  return Math.abs(Date.parse(user.createdAt) - Date.parse(user.updatedAt)) <= 1000;
}

function mergeDatabases(localDatabase, incomingDatabase) {
  const local = cleanDatabase(localDatabase);
  const incoming = cleanDatabase(incomingDatabase);
  const localDeleted = local.deletedUserKeys.map((key) => key?.toString().trim().toLowerCase()).filter(Boolean);
  const incomingDeleted = incoming.deletedUserKeys.map((key) => key?.toString().trim().toLowerCase()).filter(Boolean);
  const keys = new Set([...Object.keys(local.users), ...Object.keys(incoming.users)]);
  const revivedKeys = new Set();

  for (const key of keys) {
    const cleanKey = userKey(key);
    const incomingRevivesLocalDeletion = localDeleted.includes(cleanKey)
      && !incomingDeleted.includes(cleanKey)
      && isFreshAccountRecord(incoming.users[key]);
    const localRevivesIncomingDeletion = incomingDeleted.includes(cleanKey)
      && !localDeleted.includes(cleanKey)
      && isFreshAccountRecord(local.users[key]);

    if (incomingRevivesLocalDeletion || localRevivesIncomingDeletion) revivedKeys.add(cleanKey);
  }

  const deletedUserKeys = Array.from(new Set([...localDeleted, ...incomingDeleted]))
    .filter((key) => !revivedKeys.has(key));
  const deletedSet = new Set(deletedUserKeys);
  const users = {};

  for (const key of keys) {
    if (deletedSet.has(userKey(key))) continue;
    users[key] = mergeUser(local.users[key], incoming.users[key]);
  }

  return {
    version: 1,
    users,
    publicHints: mergePublicHints(local.publicHints, incoming.publicHints),
    deletedUserKeys,
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") return jsonResponse({ ok: true });

  const driver = getDatabaseDriver(env);
  if (!driver) {
    return jsonResponse({
      ok: false,
      error: "Missing writable Cloudflare database binding. Bind a D1 database named PUZZLE_HUNT_D1 (preferred), or a KV namespace named PUZZLE_HUNT_KV, so account creation and progress can be shared across profiles.",
    }, { status: 503 });
  }

  if (request.method === "GET") {
    return jsonResponse(await driver.get(), { headers: { "X-Puzzle-Hunt-Store": driver.type } });
  }

  if (["PUT", "POST"].includes(request.method)) {
    const database = await request.json().catch(() => null);
    if (!database || typeof database !== "object") {
      return jsonResponse({ error: "Invalid database JSON" }, { status: 400 });
    }

    const stored = await driver.get();
    const merged = mergeDatabases(stored, database);
    const confirmed = await driver.put(merged);
    return jsonResponse(confirmed, { headers: { "X-Puzzle-Hunt-Store": driver.type } });
  }

  return jsonResponse({ error: "Method not allowed" }, { status: 405 });
}
