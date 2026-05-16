const DATABASE_KEY = "database";
const EMPTY_DATABASE = { version: 1, users: {}, publicHints: [] };
const PREFERRED_KV_BINDINGS = ["PUZZLE_HUNT_KV", "PUZZLEHUNT_KV", "PUZZLE_HUNT_DATABASE", "DATABASE", "KV"];

function isKvNamespace(binding) {
  return Boolean(binding && typeof binding.get === "function" && typeof binding.put === "function");
}

function getDatabaseStore(env = {}) {
  for (const name of PREFERRED_KV_BINDINGS) {
    if (isKvNamespace(env[name])) return env[name];
  }

  return Object.values(env).find(isKvNamespace) || null;
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

function cleanDatabase(database) {
  return {
    version: 1,
    users: database?.users && typeof database.users === "object" ? database.users : {},
    publicHints: Array.isArray(database?.publicHints) ? database.publicHints : [],
    deletedUserKeys: Array.isArray(database?.deletedUserKeys)
      ? database.deletedUserKeys.map((key) => key?.toString().trim().toLowerCase()).filter(Boolean)
      : [],
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

function mergeDatabases(localDatabase, incomingDatabase) {
  const local = cleanDatabase(localDatabase);
  const incoming = cleanDatabase(incomingDatabase);
  const deletedUserKeys = Array.from(new Set([
    ...local.deletedUserKeys,
    ...incoming.deletedUserKeys,
  ].map((key) => key?.toString().trim().toLowerCase()).filter(Boolean)));
  const deletedSet = new Set(deletedUserKeys);
  const users = {};
  const keys = new Set([...Object.keys(local.users), ...Object.keys(incoming.users)]);

  for (const key of keys) {
    if (deletedSet.has(key.toString().trim().toLowerCase())) continue;
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

  const store = getDatabaseStore(env);
  if (!store) {
    return jsonResponse({ error: "Missing writable Cloudflare KV binding for the puzzle hunt database" }, { status: 503 });
  }

  if (request.method === "GET") {
    const stored = await store.get(DATABASE_KEY, { type: "json" });
    return jsonResponse(cleanDatabase(stored || EMPTY_DATABASE));
  }

  if (["PUT", "POST"].includes(request.method)) {
    const database = await request.json().catch(() => null);
    if (!database || typeof database !== "object") {
      return jsonResponse({ error: "Invalid database JSON" }, { status: 400 });
    }

    const stored = await store.get(DATABASE_KEY, { type: "json" });
    const merged = mergeDatabases(stored || EMPTY_DATABASE, database);
    await store.put(DATABASE_KEY, JSON.stringify(merged));
    return jsonResponse(merged);
  }

  return jsonResponse({ error: "Method not allowed" }, { status: 405 });
}
