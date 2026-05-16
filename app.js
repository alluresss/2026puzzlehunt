// app.js — Puzzle Hunt logic with account-based progress, sequential unlocks, and celebrations.

const INTRODUCTION_PUZZLE = {
  id: 0,
  title: "Introduction",
  path: "puzzles/introduction.html",
  answer: "SOLVED",
  kind: "Introduction",
  allowHints: false,
};

const HUNT_PUZZLES = [
  { id: 1, title: "Puzzle 1", path: "puzzles/puzzle1.html", answer: "AIRBUS", kind: "Puzzle" },
  { id: 2, title: "Puzzle 2", path: "puzzles/puzzle2.html", answer: "GRAVITY", kind: "Puzzle" },
  { id: 3, title: "Puzzle 3", path: "puzzles/puzzle3.html", answer: "PANCAKES", kind: "Puzzle" },
  { id: 4, title: "Puzzle 4", path: "puzzles/puzzle4.html", answer: "BADGE", kind: "Puzzle" },
  { id: 5, title: "Puzzle 5", path: "puzzles/puzzle5.html", answer: "OVERRIDE", kind: "Puzzle" },
  { id: 6, title: "Puzzle 6", path: "puzzles/puzzle6.html", answer: "WOOL", kind: "Puzzle" },
  { id: 7, title: "Puzzle 7", path: "puzzles/puzzle7.html", answer: "BOLDED", kind: "Puzzle" },
  { id: 8, title: "Puzzle 8", path: "puzzles/puzzle8.html", answer: "EAGLE", kind: "Puzzle" },
  { id: 9, title: "Puzzle 9", path: "puzzles/puzzle9.html", answer: "DOCUMENT", kind: "Puzzle" },
  { id: 10, title: "Puzzle 10", path: "puzzles/puzzle10.html", answer: "PLANE", kind: "Puzzle" },
  { id: 11, title: "Puzzle 11", path: "puzzles/puzzle11.html", answer: "PORTFOLIO", kind: "Puzzle" },
  { id: 12, title: "Metapuzzle", path: "puzzles/metapuzzle.html", answer: "HACKED", kind: "Meta" },
];

const MAIN_PUZZLES = HUNT_PUZZLES.filter((puzzle) => puzzle.kind === "Puzzle");
const PUZZLES = [INTRODUCTION_PUZZLE, ...HUNT_PUZZLES];
const MAX_PUZZLE_ID = Math.max(...PUZZLES.map((puzzle) => puzzle.id));

const DATABASE_KEY = "puzzle_hunt_database_v1";
const SESSION_KEY = "puzzle_hunt_current_user_v1";
const ADMIN_ACCOUNT = { username: "easonadmin", password: "adminadmin" };
const RETIRED_SEEDED_PLAYER_USER_KEYS = ["easoneason"];
const HINT_EMAIL = "easond29@lakesideschool.org";
const HINT_EMAIL_ENDPOINT = `https://formsubmit.co/ajax/${HINT_EMAIL}`;
const SOLVE_NOTIFICATION_KEY = "puzzle_hunt_solve_notification_v1";
// Use a real shared sync endpoint for multiplayer accounts/progress.
// Configure DEFAULT_SYNC_ENDPOINT once here (or set window.PUZZLE_HUNT_SYNC_ENDPOINT
// before app.js loads) so index.html and every puzzle page talk to the same database.
const DEFAULT_SYNC_ENDPOINT = "/api";
const SYNC_ENDPOINT = (window.PUZZLE_HUNT_SYNC_ENDPOINT || DEFAULT_SYNC_ENDPOINT).toString().trim().replace(/\/+$/, "");
const REMOTE_SYNC_INTERVAL_MS = 15000;
// Keep user data in the shared cloud backend. localStorage is only a browser cache
// so a different Google/Chrome profile can still access the same accounts, progress,
// hint history, admin state, and leaderboard data after the cloud sync succeeds.
const CLOUD_DATABASE_REQUIRED = window.PUZZLE_HUNT_REQUIRE_CLOUD_DATABASE !== false;
let lastRemoteSyncOk = false;
let lastRemoteSyncAt = "";
let syncPushTimer = null;
let syncInFlight = false;
let activeRemotePushPromise = null;
let initialRemoteSyncPromise = null;
let pendingRemotePushPromise = null;


// -------------------------
// Overlays (confetti only)
// -------------------------
function ensureOverlays() {
  if (!document.getElementById("confettiLayer")) {
    const c = document.createElement("div");
    c.id = "confettiLayer";
    document.body.appendChild(c);
  }
}

function navigateWithoutTransition(href) {
  window.location.href = href;
}

// -------------------------
// Celebration confetti
// -------------------------
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function spawnCelebrationConfetti({ x, y }) {
  ensureOverlays();
  const layer = document.getElementById("confettiLayer");
  if (!layer) return;

  const colors = [
    "#2563eb",
    "#06b6d4",
    "#14b8a6",
    "#f59e0b",
    "#f8fafc",
  ];

  for (let i = 0; i < 72; i++) {
    const el = document.createElement("div");
    const isRibbon = Math.random() < 0.42;

    el.className = "confetti" + (isRibbon ? " ribbon" : "");
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.setProperty("--x", `${x}px`);
    el.style.setProperty("--y", `${y}px`);
    el.style.setProperty("--dx", `${rand(-280, 280)}px`);
    el.style.setProperty("--dy", `${rand(-340, -95)}px`);
    el.style.setProperty("--rot", `${rand(-720, 720)}deg`);

    if (!isRibbon) {
      const s = rand(6, 12);
      el.style.width = `${s}px`;
      el.style.height = `${s}px`;
    } else {
      el.style.width = `${rand(12, 24)}px`;
      el.style.height = `${rand(3, 5)}px`;
    }

    layer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }
}

// -------------------------
// Account notifications
// -------------------------
function showNotification(message, type = "ok") {
  let region = document.getElementById("notificationRegion");
  if (!region) {
    region = document.createElement("div");
    region.id = "notificationRegion";
    region.className = "notification-region";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-label", "Account notifications");
    document.body.appendChild(region);
  }

  const note = document.createElement("div");
  note.className = `notification ${type}`;
  note.setAttribute("role", "status");
  note.textContent = message;
  region.appendChild(note);

  setTimeout(() => note.classList.add("is-visible"), 20);
  setTimeout(() => {
    note.classList.remove("is-visible");
    setTimeout(() => note.remove(), 220);
  }, 3600);
}

function queueSolveNotification(message) {
  sessionStorage.setItem(SOLVE_NOTIFICATION_KEY, message);
}

function showQueuedSolveNotification() {
  const message = sessionStorage.getItem(SOLVE_NOTIFICATION_KEY);
  if (!message) return;

  sessionStorage.removeItem(SOLVE_NOTIFICATION_KEY);
  showNotification(message, "ok");
}

// -------------------------
// Account database helpers
// -------------------------
function defaultProgress() {
  return { unlockedUpTo: 0, solvedIds: [], solvedAtById: {} };
}

function defaultHintRequests() {
  return [];
}

function defaultPuzzleStats() {
  return {};
}

function defaultDatabase() {
  return { version: 1, users: {}, publicHints: [], deletedUserKeys: [...RETIRED_SEEDED_PLAYER_USER_KEYS] };
}

function loadDatabase() {
  try {
    const raw = localStorage.getItem(DATABASE_KEY);
    if (!raw) return defaultDatabase();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.users || typeof parsed.users !== "object") {
      return defaultDatabase();
    }

    return retireSeededPlayerAccounts({
      version: 1,
      users: parsed.users,
      publicHints: Array.isArray(parsed.publicHints) ? parsed.publicHints : [],
      deletedUserKeys: Array.isArray(parsed.deletedUserKeys) ? parsed.deletedUserKeys.map(usernameKey).filter(Boolean) : [],
    });
  } catch {
    return defaultDatabase();
  }
}

function saveDatabase(database, options = {}) {
  const users = database?.users && typeof database.users === "object" ? database.users : {};
  const cleanUsers = Object.fromEntries(
    Object.entries(users).map(([key, user]) => [
      key,
      user && typeof user === "object"
        ? { ...user, puzzleStats: sanitizePuzzleStats(user.puzzleStats) }
        : user,
    ])
  );
  const cleanDatabase = retireSeededPlayerAccounts({
    version: 1,
    users: cleanUsers,
    publicHints: Array.isArray(database?.publicHints) ? database.publicHints : [],
    deletedUserKeys: Array.isArray(database?.deletedUserKeys) ? database.deletedUserKeys.map(usernameKey).filter(Boolean) : [],
  });
  localStorage.setItem(DATABASE_KEY, JSON.stringify(cleanDatabase));
  if (!options.skipRemote) queueRemoteDatabasePush();
}

function remoteDatabaseUrl() {
  return SYNC_ENDPOINT ? `${SYNC_ENDPOINT}/database` : "";
}

function cloudDatabaseStatus() {
  if (!remoteDatabaseUrl()) {
    return {
      configured: false,
      required: CLOUD_DATABASE_REQUIRED,
      ready: !CLOUD_DATABASE_REQUIRED,
      lastSyncedAt: lastRemoteSyncAt,
    };
  }

  return {
    configured: true,
    required: CLOUD_DATABASE_REQUIRED,
    ready: !CLOUD_DATABASE_REQUIRED || lastRemoteSyncOk,
    lastSyncedAt: lastRemoteSyncAt,
  };
}

function cloudUnavailableMessage(action = "continue") {
  if (!remoteDatabaseUrl()) {
    return `The shared cloud database is not configured, so ${action} is disabled to prevent saving account data only in this browser.`;
  }

  return `Could not reach the shared cloud database, so ${action} is disabled to prevent saving account data only in this browser. Please refresh and try again.`;
}

function canUseCachedDatabaseForWrites() {
  const status = cloudDatabaseStatus();
  return status.ready;
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

function mergeProgress(localProgress, remoteProgress) {
  const local = sanitizeProgress(localProgress);
  const remote = sanitizeProgress(remoteProgress);
  const solvedSet = new Set([...local.solvedIds, ...remote.solvedIds]);
  const solvedAtById = {};

  for (const puzzleId of solvedSet) {
    const key = String(puzzleId);
    solvedAtById[key] = olderTimestamp(local.solvedAtById[key], remote.solvedAtById[key])
      || local.solvedAtById[key]
      || remote.solvedAtById[key]
      || new Date().toISOString();
  }

  return {
    unlockedUpTo: Math.max(local.unlockedUpTo, remote.unlockedUpTo),
    solvedIds: Array.from(solvedSet),
    solvedAtById,
  };
}

function mergeHintRequests(localRequests, remoteRequests) {
  const byId = new Map();
  [...(Array.isArray(localRequests) ? localRequests : []), ...(Array.isArray(remoteRequests) ? remoteRequests : [])]
    .map(sanitizeHintRequest)
    .filter(Boolean)
    .forEach((request) => {
      const existing = byId.get(request.id);
      if (!existing) {
        byId.set(request.id, request);
        return;
      }

      const latestDecision = newerTimestamp(existing.decidedAt, request.decidedAt);
      byId.set(request.id, {
        ...existing,
        ...request,
        progressText: request.progressText || existing.progressText,
        responseText: request.responseText || existing.responseText,
        status: latestDecision === request.decidedAt ? request.status : existing.status,
        createdAt: olderTimestamp(existing.createdAt, request.createdAt) || existing.createdAt || request.createdAt,
        decidedAt: latestDecision,
        seenByUser: existing.seenByUser && request.seenByUser,
      });
    });

  return Array.from(byId.values()).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

function mergePuzzleStats(localStats, remoteStats) {
  const local = sanitizePuzzleStats(localStats);
  const remote = sanitizePuzzleStats(remoteStats);
  const ids = new Set([...Object.keys(local), ...Object.keys(remote)]);

  return Object.fromEntries(Array.from(ids).map((id) => {
    const localStat = local[id] || {};
    const remoteStat = remote[id] || {};
    const puzzle = getPuzzleById(id);
    return [id, {
      puzzleId: Number(id),
      puzzleTitle: localStat.puzzleTitle || remoteStat.puzzleTitle || puzzle?.title || `Puzzle ${id}`,
      firstOpenedAt: olderTimestamp(localStat.firstOpenedAt, remoteStat.firstOpenedAt),
      lastOpenedAt: newerTimestamp(localStat.lastOpenedAt, remoteStat.lastOpenedAt),
    }];
  }));
}

function mergeUserRecords(localUser, remoteUser) {
  if (!localUser) return remoteUser;
  if (!remoteUser) return localUser;

  const localUpdated = Date.parse(localUser.updatedAt || "");
  const remoteUpdated = Date.parse(remoteUser.updatedAt || "");
  const remoteIsNewer = !Number.isNaN(remoteUpdated) && (Number.isNaN(localUpdated) || remoteUpdated > localUpdated);
  const preferred = remoteIsNewer ? remoteUser : localUser;
  const fallback = remoteIsNewer ? localUser : remoteUser;

  return {
    ...fallback,
    ...preferred,
    username: preferred.username || fallback.username,
    passwordHash: preferred.passwordHash || fallback.passwordHash || "",
    isAdmin: Boolean(preferred.isAdmin || fallback.isAdmin),
    hiddenFromLeaderboard: Boolean(preferred.hiddenFromLeaderboard || fallback.hiddenFromLeaderboard),
    progress: mergeProgress(localUser.progress, remoteUser.progress),
    hintRequests: mergeHintRequests(localUser.hintRequests, remoteUser.hintRequests),
    puzzleStats: mergePuzzleStats(localUser.puzzleStats, remoteUser.puzzleStats),
    createdAt: olderTimestamp(localUser.createdAt, remoteUser.createdAt) || preferred.createdAt || fallback.createdAt,
    updatedAt: newerTimestamp(localUser.updatedAt, remoteUser.updatedAt) || preferred.updatedAt || fallback.updatedAt,
  };
}

function mergePublicHints(localHints, remoteHints) {
  const byId = new Map();
  [...(Array.isArray(localHints) ? localHints : []), ...(Array.isArray(remoteHints) ? remoteHints : [])]
    .map(sanitizePublicHint)
    .filter(Boolean)
    .forEach((hint) => {
      const existing = byId.get(hint.id);
      if (!existing) {
        byId.set(hint.id, hint);
        return;
      }

      byId.set(hint.id, {
        ...existing,
        ...hint,
        seenBy: Array.from(new Set([...(existing.seenBy || []), ...(hint.seenBy || [])])),
        createdAt: olderTimestamp(existing.createdAt, hint.createdAt) || existing.createdAt || hint.createdAt,
      });
    });

  return Array.from(byId.values()).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

function isFreshAccountRecord(user) {
  if (!user || typeof user !== "object") return false;
  if (!user.createdAt || !user.updatedAt) return false;
  return Math.abs(Date.parse(user.createdAt) - Date.parse(user.updatedAt)) <= 1000;
}

function mergeDatabases(localDatabase, remoteDatabase) {
  const local = localDatabase && typeof localDatabase === "object" ? localDatabase : defaultDatabase();
  const remote = remoteDatabase && typeof remoteDatabase === "object" ? remoteDatabase : defaultDatabase();
  const localDeleted = (Array.isArray(local.deletedUserKeys) ? local.deletedUserKeys : []).map(usernameKey).filter(Boolean);
  const remoteDeleted = (Array.isArray(remote.deletedUserKeys) ? remote.deletedUserKeys : []).map(usernameKey).filter(Boolean);
  const keys = new Set([...Object.keys(local.users || {}), ...Object.keys(remote.users || {})]);
  const revivedKeys = new Set();

  for (const key of keys) {
    const cleanKey = usernameKey(key);
    if (!cleanKey) continue;

    const localRevivesRemoteDeletion = remoteDeleted.includes(cleanKey)
      && !localDeleted.includes(cleanKey)
      && isFreshAccountRecord(local.users?.[key]);
    const remoteRevivesLocalDeletion = localDeleted.includes(cleanKey)
      && !remoteDeleted.includes(cleanKey)
      && isFreshAccountRecord(remote.users?.[key]);

    if (localRevivesRemoteDeletion || remoteRevivesLocalDeletion) revivedKeys.add(cleanKey);
  }

  const deletedUserKeys = Array.from(new Set([...localDeleted, ...remoteDeleted]))
    .filter((key) => !revivedKeys.has(key));
  const deletedSet = new Set(deletedUserKeys);
  const users = {};

  for (const key of keys) {
    if (deletedSet.has(usernameKey(key))) continue;
    users[key] = mergeUserRecords(local.users?.[key], remote.users?.[key]);
  }

  return retireSeededPlayerAccounts({
    version: 1,
    users,
    publicHints: mergePublicHints(local.publicHints, remote.publicHints),
    deletedUserKeys,
  });
}

async function readSyncResponseError(response, fallback) {
  const data = await response.clone().json().catch(() => null);
  return data?.error || data?.message || `${fallback} (HTTP ${response.status})`;
}

async function fetchRemoteDatabase() {
  const url = remoteDatabaseUrl();
  if (!url) return null;

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 404) return defaultDatabase();
  if (!response.ok) throw new Error(await readSyncResponseError(response, "Could not load the shared account database"));

  const data = await response.json();
  return data && typeof data === "object" ? data : defaultDatabase();
}

async function pushRemoteDatabase(database = loadDatabase(), options = {}) {
  database = retireSeededPlayerAccounts(database);
  const url = remoteDatabaseUrl();
  if (!url) return false;

  if (syncInFlight && activeRemotePushPromise) {
    await activeRemotePushPromise.catch(() => false);
    return pushRemoteDatabase(loadDatabase(), options);
  }

  syncInFlight = true;
  activeRemotePushPromise = (async () => {
    try {
      const payload = options.mergeRemote === false
        ? database
        : mergeDatabases(await fetchRemoteDatabase().catch(() => defaultDatabase()), database);
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        lastRemoteSyncOk = true;
        lastRemoteSyncAt = new Date().toISOString();
        const savedDatabase = await response.json().catch(() => payload);
        saveDatabase(savedDatabase && typeof savedDatabase === "object" ? savedDatabase : payload, { skipRemote: true });
      } else {
        const message = await readSyncResponseError(response, "Could not save to the shared account database");
        console.warn(message);
        if (options.markReachabilityOnFailure !== false) lastRemoteSyncOk = false;
      }

      return response.ok;
    } catch (error) {
      console.warn(error?.message || "Could not communicate with the shared account database.");
      if (options.markReachabilityOnFailure !== false) lastRemoteSyncOk = false;
      return false;
    } finally {
      syncInFlight = false;
      activeRemotePushPromise = null;
    }
  })();

  return activeRemotePushPromise;
}

function queueRemoteDatabasePush() {
  if (!remoteDatabaseUrl()) return Promise.resolve(false);
  clearTimeout(syncPushTimer);
  pendingRemotePushPromise = new Promise((resolve) => {
    syncPushTimer = setTimeout(() => {
      syncPushTimer = null;
      pushRemoteDatabase().then(resolve);
    }, 350);
  });
  return pendingRemotePushPromise;
}

function flushRemoteDatabasePush(database = loadDatabase()) {
  if (!remoteDatabaseUrl()) return Promise.resolve(false);
  clearTimeout(syncPushTimer);
  syncPushTimer = null;
  pendingRemotePushPromise = pushRemoteDatabase(database);
  return pendingRemotePushPromise;
}

function ensureRemoteDatabaseSyncedOnce() {
  if (!remoteDatabaseUrl()) return Promise.resolve(false);
  if (!initialRemoteSyncPromise) {
    initialRemoteSyncPromise = syncDatabaseFromRemote().finally(() => {
      initialRemoteSyncPromise = null;
    });
  }
  return initialRemoteSyncPromise;
}

function showSyncGate(message = "Syncing account progress…") {
  let gate = document.getElementById("syncGate");
  if (gate) return gate;

  gate = document.createElement("div");
  gate.id = "syncGate";
  gate.className = "sync-gate";
  gate.setAttribute("role", "status");
  gate.setAttribute("aria-live", "polite");
  gate.innerHTML = `<div class="sync-gate-card"><strong>${message}</strong><span>Please wait while the shared hunt database loads.</span></div>`;
  document.body.appendChild(gate);
  return gate;
}

function hideSyncGate() {
  document.getElementById("syncGate")?.remove();
}

async function syncDatabaseFromRemote() {
  if (!remoteDatabaseUrl()) return false;

  try {
    const remote = await fetchRemoteDatabase();
    if (!remote) return false;

    const merged = mergeDatabases(loadDatabase(), remote);
    saveDatabase(merged, { skipRemote: true });

    // A successful read proves the shared database is reachable.  Do not block
    // login/account access on this opportunistic write-back; later explicit
    // account/progress writes will perform their own remote save attempts and
    // can mark the cloud unavailable if those saves fail.
    lastRemoteSyncOk = true;
    lastRemoteSyncAt = new Date().toISOString();

    await pushRemoteDatabase(merged, { mergeRemote: false, markReachabilityOnFailure: false });
    return true;
  } catch {
    lastRemoteSyncOk = false;
    return false;
  }
}

function normalizeUsername(username) {
  return (username ?? "").toString().trim().replace(/\s+/g, " ");
}

function usernameKey(username) {
  return normalizeUsername(username).toLowerCase();
}

function isAdminUsername(username) {
  return usernameKey(username) === usernameKey(ADMIN_ACCOUNT.username);
}

function isRetiredSeededPlayerUsername(username) {
  return RETIRED_SEEDED_PLAYER_USER_KEYS.includes(usernameKey(username));
}

function retireSeededPlayerAccounts(database) {
  const retiredKeys = new Set(RETIRED_SEEDED_PLAYER_USER_KEYS);
  const users = {};

  for (const [key, user] of Object.entries(database?.users || {})) {
    const cleanKey = usernameKey(key);
    const cleanUsername = usernameKey(user?.username);
    if (retiredKeys.has(cleanKey) || retiredKeys.has(cleanUsername)) continue;
    users[key] = user;
  }

  const deletedUserKeys = Array.from(new Set([
    ...(Array.isArray(database?.deletedUserKeys) ? database.deletedUserKeys : []),
    ...RETIRED_SEEDED_PLAYER_USER_KEYS,
  ].map(usernameKey).filter(Boolean)));

  return {
    version: 1,
    users,
    publicHints: Array.isArray(database?.publicHints) ? database.publicHints : [],
    deletedUserKeys,
  };
}

function isCurrentUserAdmin() {
  return isAdminUsername(sessionStorage.getItem(SESSION_KEY));
}

function adminProgress(progress) {
  return {
    ...sanitizeProgress(progress),
    unlockedUpTo: MAX_PUZZLE_ID,
  };
}

function validateCredentials(username, password) {
  const cleanUsername = normalizeUsername(username);
  const rawPassword = (password ?? "").toString();

  if (cleanUsername.length < 3 || cleanUsername.length > 24) {
    return { ok: false, msg: "Username must be 3–24 characters." };
  }

  if (!/^[a-z0-9 _-]+$/i.test(cleanUsername)) {
    return { ok: false, msg: "Username can only use letters, numbers, spaces, underscores, and hyphens." };
  }

  if (rawPassword.length < 4) {
    return { ok: false, msg: "Password must be at least 4 characters." };
  }

  return { ok: true, username: cleanUsername, password: rawPassword };
}

async function hashPassword(username, password) {
  const input = `${usernameKey(username)}:${password}`;

  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback for older browsers or local file previews that do not expose Web Crypto.
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0;
  }
  return `fallback-${Math.abs(hash).toString(16)}`;
}

function getCurrentUsername() {
  const username = normalizeUsername(sessionStorage.getItem(SESSION_KEY));
  if (!username) return null;
  if (isAdminUsername(username)) return ADMIN_ACCOUNT.username;

  const database = loadDatabase();
  return database.users[usernameKey(username)] ? username : null;
}

function setCurrentUsername(username) {
  sessionStorage.setItem(SESSION_KEY, normalizeUsername(username));
}

function clearCurrentUsername() {
  sessionStorage.removeItem(SESSION_KEY);
}

function sanitizeProgress(progress) {
  const fallback = defaultProgress();
  if (!progress || typeof progress !== "object") return fallback;

  const unlockedUpTo = Number(progress.unlockedUpTo);
  const solvedIds = Array.isArray(progress.solvedIds) ? progress.solvedIds : [];
  const solvedAtById = progress.solvedAtById && typeof progress.solvedAtById === "object"
    ? progress.solvedAtById
    : {};

  if (!Number.isFinite(unlockedUpTo) || unlockedUpTo < 0) return fallback;

  const solvedSet = new Set(
    solvedIds
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= MAX_PUZZLE_ID)
  );

  const cleanSolvedAtById = Object.fromEntries(
    Array.from(solvedSet)
      .map((puzzleId) => [String(puzzleId), solvedAtById[String(puzzleId)] || solvedAtById[puzzleId] || ""])
      .filter(([, solvedAt]) => {
        if (!solvedAt) return false;
        const date = new Date(solvedAt);
        return !Number.isNaN(date.getTime());
      })
  );

  return {
    unlockedUpTo: Math.min(unlockedUpTo, MAX_PUZZLE_ID + 1),
    solvedIds: Array.from(solvedSet),
    solvedAtById: cleanSolvedAtById,
  };
}

function loadProgress() {
  const username = getCurrentUsername();
  if (!username) return defaultProgress();

  const database = loadDatabase();
  const user = database.users[usernameKey(username)];
  if (isAdminUsername(username)) return adminProgress(user?.progress);

  return sanitizeProgress(user?.progress);
}

function saveProgress(progress) {
  const username = getCurrentUsername();
  if (!username) return false;
  if (!canUseCachedDatabaseForWrites()) return false;

  const database = loadDatabase();
  const key = usernameKey(username);
  const now = new Date().toISOString();
  if (!database.users[key]) {
    if (!isAdminUsername(username)) return false;

    database.users[key] = {
      username: ADMIN_ACCOUNT.username,
      passwordHash: "",
      isAdmin: true,
      hiddenFromLeaderboard: true,
      progress: defaultProgress(),
      hintRequests: defaultHintRequests(),
      puzzleStats: defaultPuzzleStats(),
      createdAt: now,
      updatedAt: now,
    };
  }

  database.users[key].progress = isAdminUsername(username)
    ? adminProgress(progress)
    : sanitizeProgress(progress);
  database.users[key].updatedAt = now;
  saveDatabase(database);
  return true;
}

async function createAccount(username, password) {
  const synced = await ensureRemoteDatabaseSyncedOnce();
  if (CLOUD_DATABASE_REQUIRED && !synced) {
    return { ok: false, msg: cloudUnavailableMessage("creating accounts") };
  }
  if (remoteDatabaseUrl() && !synced) {
    return { ok: false, msg: "Could not reach the shared account database. Please try again before creating an account." };
  }

  const validation = validateCredentials(username, password);
  if (!validation.ok) return validation;
  if (isAdminUsername(validation.username)) {
    return { ok: false, msg: "That username is reserved for hunt administration." };
  }
  if (isRetiredSeededPlayerUsername(validation.username)) {
    return { ok: false, msg: "That seeded account has been removed." };
  }

  const database = loadDatabase();
  const key = usernameKey(validation.username);
  if (database.users[key]) {
    return { ok: false, msg: "That username already exists. Log in instead." };
  }

  database.deletedUserKeys = (Array.isArray(database.deletedUserKeys) ? database.deletedUserKeys : [])
    .map(usernameKey)
    .filter((deletedKey) => deletedKey && deletedKey !== key);

  const now = new Date().toISOString();
  database.users[key] = {
    username: validation.username,
    passwordHash: await hashPassword(validation.username, validation.password),
    hiddenFromLeaderboard: false,
    progress: defaultProgress(),
    hintRequests: defaultHintRequests(),
    puzzleStats: defaultPuzzleStats(),
    createdAt: now,
    updatedAt: now,
  };

  saveDatabase(database);
  const savedRemotely = await flushRemoteDatabasePush(database);
  const latestDatabase = loadDatabase();
  const savedUser = latestDatabase.users?.[key];

  if (remoteDatabaseUrl() && (!savedRemotely || !savedUser)) {
    delete latestDatabase.users[key];
    saveDatabase(latestDatabase, { skipRemote: true });
    return { ok: false, msg: "Account creation could not be confirmed in the shared database. Please refresh and try again." };
  }

  setCurrentUsername(validation.username);
  return { ok: true, msg: `Welcome, ${validation.username}! Your account was saved to the shared database.` };
}

async function ensureAdminAccount() {
  const database = loadDatabase();
  const key = usernameKey(ADMIN_ACCOUNT.username);
  const now = new Date().toISOString();
  const existing = database.users[key];

  database.users[key] = {
    ...(existing && typeof existing === "object" ? existing : {}),
    username: ADMIN_ACCOUNT.username,
    passwordHash: await hashPassword(ADMIN_ACCOUNT.username, ADMIN_ACCOUNT.password),
    isAdmin: true,
    hiddenFromLeaderboard: true,
    progress: adminProgress(existing?.progress),
    hintRequests: defaultHintRequests(),
    puzzleStats: sanitizePuzzleStats(existing?.puzzleStats),
    createdAt: existing?.createdAt || now,
    updatedAt: existing?.updatedAt || now,
  };

  saveDatabase(database);
  await flushRemoteDatabasePush(database);
  return database.users[key];
}

async function login(username, password) {
  const synced = await ensureRemoteDatabaseSyncedOnce();

  if (CLOUD_DATABASE_REQUIRED && !synced) {
    return { ok: false, msg: cloudUnavailableMessage("logging in") };
  }

  const validation = validateCredentials(username, password);
  if (!validation.ok) return validation;

  if (isAdminUsername(validation.username)) {
    if (validation.password !== ADMIN_ACCOUNT.password) return { ok: false, msg: "Incorrect password." };

    const user = await ensureAdminAccount();
    setCurrentUsername(user.username);
    return { ok: true, msg: "Welcome, admin. All puzzles and account tools are unlocked." };
  }

  if (isRetiredSeededPlayerUsername(validation.username)) {
    return { ok: false, msg: "That seeded account has been removed." };
  }

  const database = loadDatabase();
  const user = database.users[usernameKey(validation.username)];
  if (!user) {
    if (remoteDatabaseUrl() && !synced) {
      return { ok: false, msg: "Could not reach the shared account database. Please try again before logging in." };
    }
    return { ok: false, msg: "No account found for that username." };
  }

  const passwordHash = await hashPassword(validation.username, validation.password);
  if (passwordHash !== user.passwordHash) return { ok: false, msg: "Incorrect password." };

  setCurrentUsername(user.username);
  return { ok: true, msg: `Welcome back, ${user.username}!` };
}

function logout() {
  clearCurrentUsername();
}

function resetCurrentProgress() {
  const username = getCurrentUsername();
  if (!username || isAdminUsername(username)) return false;
  return saveProgress(defaultProgress());
}

function deleteUserAccount(username) {
  if (!canUseCachedDatabaseForWrites()) return { ok: false, msg: cloudUnavailableMessage("deleting accounts") };
  if (isAdminUsername(username)) return { ok: false, msg: "The admin account cannot be deleted." };

  const database = loadDatabase();
  const key = usernameKey(username);
  const user = database.users[key];
  if (!user) return { ok: false, msg: "That account no longer exists." };

  delete database.users[key];
  database.deletedUserKeys = Array.from(new Set([
    ...(Array.isArray(database.deletedUserKeys) ? database.deletedUserKeys : []),
    key,
  ].map(usernameKey).filter(Boolean)));
  saveDatabase(database);

  const currentUsername = normalizeUsername(sessionStorage.getItem(SESSION_KEY));
  if (usernameKey(currentUsername) === key) clearCurrentUsername();

  return { ok: true, msg: `Deleted account for ${user.username}.` };
}

function getPlayerRows() {
  const database = loadDatabase();
  return Object.values(database.users)
    .filter((user) => user?.username && !isAdminUsername(user.username));
}

function sanitizePuzzleStats(stats) {
  if (!stats || typeof stats !== "object") return defaultPuzzleStats();

  return Object.fromEntries(
    Object.entries(stats)
      .map(([rawPuzzleId, rawStat]) => {
        const puzzleId = Number(rawPuzzleId);
        const puzzle = getPuzzleById(puzzleId);
        if (!puzzle || !rawStat || typeof rawStat !== "object") return null;

        return [String(puzzleId), {
          puzzleId,
          puzzleTitle: rawStat.puzzleTitle || puzzle.title,
          firstOpenedAt: rawStat.firstOpenedAt || "",
          lastOpenedAt: rawStat.lastOpenedAt || "",
        }];
      })
      .filter(Boolean)
  );
}

function getCurrentPuzzle(progress) {
  const cleanProgress = sanitizeProgress(progress);
  const solvedSet = new Set(cleanProgress.solvedIds);
  const currentPuzzle = PUZZLES.find((puzzle) => puzzle.id <= cleanProgress.unlockedUpTo && !solvedSet.has(puzzle.id));
  return currentPuzzle || null;
}

function secondsSince(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
}

function formatCurrentPuzzleStatus(user) {
  const progress = sanitizeProgress(user?.progress);
  const currentPuzzle = getCurrentPuzzle(progress);

  if (!currentPuzzle) return "Current puzzle: hunt complete";

  const stats = sanitizePuzzleStats(user?.puzzleStats);
  const currentStats = stats[String(currentPuzzle.id)];
  const puzzleLabel = `${currentPuzzle.kind === "Meta" ? "Metapuzzle" : `Puzzle ${currentPuzzle.id}`}: ${currentPuzzle.title}`;

  if (!currentStats?.firstOpenedAt) {
    return `Current puzzle: ${puzzleLabel} — not opened yet`;
  }

  return `Current puzzle: ${puzzleLabel} — ${formatMinutesSince(currentStats.firstOpenedAt)} since first opened`;
}

function leaderboardSolveTime(progress, user) {
  const huntSolveTimes = progress.solvedIds
    .filter((id) => id !== INTRODUCTION_PUZZLE.id)
    .map((id) => progress.solvedAtById[String(id)])
    .filter(Boolean)
    .sort();

  return huntSolveTimes[huntSolveTimes.length - 1] || user.updatedAt || user.createdAt || "";
}

function compareLeaderboardSolveTime(a, b) {
  if (!a.rankSolvedAt && !b.rankSolvedAt) return 0;
  if (!a.rankSolvedAt) return 1;
  if (!b.rankSolvedAt) return -1;
  return a.rankSolvedAt.localeCompare(b.rankSolvedAt);
}

function getLeaderboard() {
  return getPlayerRows()
    .map((user) => {
      const progress = sanitizeProgress(user.progress);
      return {
        username: user.username,
        solvedCount: progress.solvedIds.filter((id) => id !== INTRODUCTION_PUZZLE.id).length,
        rankSolvedAt: leaderboardSolveTime(progress, user),
      };
    })
    .sort((a, b) => {
      if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;

      const timeOrder = compareLeaderboardSolveTime(a, b);
      if (timeOrder !== 0) return timeOrder;

      return a.username.localeCompare(b.username);
    });
}



// -------------------------
// Hint requests
// -------------------------
function getPuzzleById(puzzleId) {
  return PUZZLES.find((p) => p.id === Number(puzzleId));
}

function sanitizeHintRequest(request) {
  if (!request || typeof request !== "object") return null;

  const puzzleId = Number(request.puzzleId);
  const puzzle = getPuzzleById(puzzleId);
  if (!puzzle) return null;

  const status = ["pending", "approved", "denied"].includes(request.status)
    ? request.status
    : "pending";

  return {
    id: request.id || `hint-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    puzzleId,
    puzzleTitle: request.puzzleTitle || puzzle.title,
    progressText: (request.progressText ?? "").toString(),
    status,
    responseText: (request.responseText ?? "").toString(),
    createdAt: request.createdAt || new Date().toISOString(),
    decidedAt: request.decidedAt || "",
    seenByUser: Boolean(request.seenByUser),
  };
}

function getUserHintRequests(user) {
  if (!user || !Array.isArray(user.hintRequests)) return defaultHintRequests();
  return user.hintRequests.map(sanitizeHintRequest).filter(Boolean);
}

function saveHintRequest(username, request) {
  if (!canUseCachedDatabaseForWrites()) return false;
  const database = loadDatabase();
  const key = usernameKey(username);
  const user = database.users[key];
  if (!user) return false;

  user.hintRequests = getUserHintRequests(user);
  user.hintRequests.push(request);
  user.updatedAt = new Date().toISOString();
  saveDatabase(database);
  return true;
}

function buildHintEmail({ username, puzzle, progressText }) {
  const subject = `${username} Hint Request for Puzzle ${puzzle.id}`;
  const body = `Hi Eason,\n\nThe individual ${username} has requested a hint for Puzzle ${puzzle.id}, Titled ${puzzle.title}. Their progress so far: ${progressText}.\n\nPlease go to your admin account to address this request.`;

  return { subject, body };
}

function todayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function getCurrentUserHintRequests() {
  const username = getCurrentUsername();
  if (!username || isAdminUsername(username)) return [];

  const database = loadDatabase();
  return getUserHintRequests(database.users[usernameKey(username)]);
}

function getTodaysHintRequest() {
  const day = todayKey();
  return getCurrentUserHintRequests().find((request) => todayKey(new Date(request.createdAt)) === day) || null;
}

function getHintRequestsForPuzzle(puzzleId) {
  return getCurrentUserHintRequests()
    .filter((request) => request.puzzleId === Number(puzzleId))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function sendHintRequestEmail({ username, puzzle, progressText }) {
  const email = buildHintEmail({ username, puzzle, progressText });
  const payload = {
    _subject: email.subject,
    name: username,
    puzzle: `Puzzle ${puzzle.id}: ${puzzle.title}`,
    message: email.body,
    progress: progressText,
  };

  return fetch(HINT_EMAIL_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => null);
}

function requestHint(puzzleId, progressText) {
  const username = getCurrentUsername();
  const puzzle = getPuzzleById(puzzleId);
  const cleanProgress = (progressText ?? "").toString().trim();

  if (!username) return { ok: false, msg: "Log in before requesting a hint." };
  if (isAdminUsername(username)) return { ok: false, msg: "Admin accounts cannot request hints." };
  if (!puzzle) return { ok: false, msg: "Puzzle not found." };
  if (puzzle.allowHints === false) return { ok: false, msg: "Hint requests are not available for the introduction." };
  if (!cleanProgress) return { ok: false, msg: "Please describe your thought process before sending." };

  const existingToday = getTodaysHintRequest();
  if (existingToday) {
    return { ok: false, msg: "You can request one hint per day. Please try again tomorrow." };
  }

  const request = sanitizeHintRequest({
    puzzleId: puzzle.id,
    puzzleTitle: puzzle.title,
    progressText: cleanProgress,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  if (!saveHintRequest(username, request)) {
    return { ok: false, msg: "Unable to save this hint request. Please try again." };
  }

  sendHintRequestEmail({ username, puzzle, progressText: cleanProgress });
  return { ok: true, msg: "Hint request sent. You can request one hint per day." };
}

function updateHintRequest(username, requestId, changes) {
  if (!canUseCachedDatabaseForWrites()) return { ok: false, msg: cloudUnavailableMessage("updating hint requests") };
  const database = loadDatabase();
  const key = usernameKey(username);
  const user = database.users[key];
  if (!user) return { ok: false, msg: "That account no longer exists." };

  const requests = getUserHintRequests(user);
  const index = requests.findIndex((request) => request.id === requestId);
  if (index < 0) return { ok: false, msg: "That hint request no longer exists." };

  requests[index] = sanitizeHintRequest({ ...requests[index], ...changes }) || requests[index];
  user.hintRequests = requests;
  user.updatedAt = new Date().toISOString();
  saveDatabase(database);
  return { ok: true, msg: "Hint request updated." };
}

function denyHintRequest(username, requestId) {
  return updateHintRequest(username, requestId, {
    status: "denied",
    responseText: "",
    decidedAt: new Date().toISOString(),
    seenByUser: false,
  });
}

function approveHintRequest(username, requestId, responseText) {
  const cleanResponse = (responseText ?? "").toString().trim();
  if (!cleanResponse) return { ok: false, msg: "Write a personalized hint before sending." };

  return updateHintRequest(username, requestId, {
    status: "approved",
    responseText: cleanResponse,
    decidedAt: new Date().toISOString(),
    seenByUser: false,
  });
}

function getUnseenHintResponses() {
  const username = getCurrentUsername();
  if (!username || isAdminUsername(username)) return [];

  const database = loadDatabase();
  const user = database.users[usernameKey(username)];
  return getUserHintRequests(user).filter((request) =>
    !request.seenByUser && ["approved", "denied"].includes(request.status)
  );
}

function markHintResponsesSeen(requestIds) {
  const username = getCurrentUsername();
  if (!username || !requestIds.length || !canUseCachedDatabaseForWrites()) return;

  const database = loadDatabase();
  const user = database.users[usernameKey(username)];
  if (!user) return;

  const idSet = new Set(requestIds);
  user.hintRequests = getUserHintRequests(user).map((request) =>
    idSet.has(request.id) ? { ...request, seenByUser: true } : request
  );
  user.updatedAt = new Date().toISOString();
  saveDatabase(database);
}

// -------------------------
// Public hints / clarifications
// -------------------------
function sanitizePublicHint(hint) {
  if (!hint || typeof hint !== "object") return null;

  const puzzleId = Number(hint.puzzleId);
  const puzzle = getPuzzleById(puzzleId);
  if (!puzzle) return null;

  const content = (hint.content ?? "").toString().trim();
  if (!content) return null;

  return {
    id: hint.id || `public-hint-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    puzzleId,
    puzzleTitle: hint.puzzleTitle || puzzle.title,
    content,
    createdAt: hint.createdAt || new Date().toISOString(),
    seenBy: Array.isArray(hint.seenBy) ? hint.seenBy.map(usernameKey).filter(Boolean) : [],
  };
}

function getPublicHints() {
  const database = loadDatabase();
  return (Array.isArray(database.publicHints) ? database.publicHints : [])
    .map(sanitizePublicHint)
    .filter(Boolean)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function getPublicHintsForPuzzle(puzzleId) {
  return getPublicHints().filter((hint) => hint.puzzleId === Number(puzzleId));
}

function revokePublicHint(hintId) {
  if (!canUseCachedDatabaseForWrites()) return { ok: false, msg: cloudUnavailableMessage("revoking public hints") };
  if (!isCurrentUserAdmin()) return { ok: false, msg: "Only admins can revoke public hints." };

  const database = loadDatabase();
  const publicHints = Array.isArray(database.publicHints) ? database.publicHints : [];
  let found = false;
  const nextPublicHints = publicHints
    .map(sanitizePublicHint)
    .filter(Boolean)
    .filter((hint) => {
      if (hint.id !== hintId) return true;
      found = true;
      return false;
    });

  if (!found) {
    return { ok: false, msg: "That public hint/clarification no longer exists." };
  }

  database.publicHints = nextPublicHints;
  saveDatabase(database);
  return { ok: true, msg: "Public hint/clarification revoked." };
}

function postPublicHint(puzzleId, content) {
  if (!canUseCachedDatabaseForWrites()) return { ok: false, msg: cloudUnavailableMessage("posting public hints") };
  if (!isCurrentUserAdmin()) return { ok: false, msg: "Only admins can post public hints." };

  const puzzle = getPuzzleById(puzzleId);
  const cleanContent = (content ?? "").toString().trim();
  if (!puzzle) return { ok: false, msg: "Choose a puzzle before posting." };
  if (!cleanContent) return { ok: false, msg: "Write hint or clarification content before posting." };

  const database = loadDatabase();
  const hint = sanitizePublicHint({
    puzzleId: puzzle.id,
    puzzleTitle: puzzle.title,
    content: cleanContent,
    createdAt: new Date().toISOString(),
    seenBy: [ADMIN_ACCOUNT.username],
  });
  if (!hint) return { ok: false, msg: "Unable to post that public hint." };

  database.publicHints = Array.isArray(database.publicHints) ? database.publicHints : [];
  database.publicHints.push(hint);
  saveDatabase(database);
  return { ok: true, msg: `Public hint/clarification posted for Puzzle ${puzzle.id}.` };
}

function getUnseenPublicHints() {
  const username = getCurrentUsername();
  if (!username || isAdminUsername(username)) return [];

  const key = usernameKey(username);
  const progress = loadProgress();
  const introComplete = hasCompletedIntroduction(progress);
  return getPublicHints().filter((hint) => {
    const reachedPuzzle = hint.puzzleId === INTRODUCTION_PUZZLE.id
      || (introComplete && hint.puzzleId <= progress.unlockedUpTo);
    return reachedPuzzle && !hint.seenBy.includes(key);
  });
}

function markPublicHintsSeen(hintIds) {
  const username = getCurrentUsername();
  if (!username || isAdminUsername(username) || !hintIds.length) return;

  const database = loadDatabase();
  const idSet = new Set(hintIds);
  const key = usernameKey(username);
  database.publicHints = (Array.isArray(database.publicHints) ? database.publicHints : [])
    .map(sanitizePublicHint)
    .filter(Boolean)
    .map((hint) => {
      if (!idSet.has(hint.id) || hint.seenBy.includes(key)) return hint;
      return { ...hint, seenBy: [...hint.seenBy, key] };
    });
  saveDatabase(database);
}

function showPendingPublicHints() {
  const hints = getUnseenPublicHints();
  if (!hints.length) return;

  markPublicHintsSeen(hints.map((hint) => hint.id));
  hints.forEach((hint, index) => {
    setTimeout(() => {
      showMessageDialog(
        `Public Hint/Clarification for Puzzle ${hint.puzzleId}`,
        hint.content,
        "Public hint/clarification"
      );
    }, index * 250);
  });
}

function normalizeAnswer(s) {
  return (s ?? "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

function isSolved(puzzleId) {
  return loadProgress().solvedIds.includes(puzzleId);
}

function hasCompletedIntroduction(progress = loadProgress()) {
  return sanitizeProgress(progress).solvedIds.includes(INTRODUCTION_PUZZLE.id);
}

// -------------------------
// Puzzle first-open tracking
// -------------------------
const activePuzzleTimer = { puzzleId: null, startedAt: 0 };

function recordPuzzleTime(puzzleId) {
  const username = getCurrentUsername();
  const puzzle = getPuzzleById(puzzleId);
  if (!username || !puzzle) return false;

  const database = loadDatabase();
  const key = usernameKey(username);
  const user = database.users[key];
  if (!user) return false;

  const now = new Date().toISOString();
  const stats = sanitizePuzzleStats(user.puzzleStats);
  const previous = stats[String(puzzle.id)] || {
    puzzleId: puzzle.id,
    puzzleTitle: puzzle.title,
    firstOpenedAt: now,
    lastOpenedAt: now,
  };

  stats[String(puzzle.id)] = {
    ...previous,
    puzzleTitle: puzzle.title,
    firstOpenedAt: previous.firstOpenedAt || now,
    lastOpenedAt: now,
  };

  user.puzzleStats = stats;
  user.updatedAt = now;
  saveDatabase(database);
  return true;
}

function flushPuzzleTimer({ pause = false } = {}) {
  if (!activePuzzleTimer.puzzleId || !activePuzzleTimer.startedAt) return;

  const elapsedSeconds = Math.floor((Date.now() - activePuzzleTimer.startedAt) / 1000);
  if (elapsedSeconds > 0) recordPuzzleTime(activePuzzleTimer.puzzleId, elapsedSeconds);
  activePuzzleTimer.startedAt = pause ? 0 : Date.now();
}

function resumePuzzleTimer() {
  if (activePuzzleTimer.puzzleId && !activePuzzleTimer.startedAt) {
    activePuzzleTimer.startedAt = Date.now();
  }
}

function startPuzzleTimer(puzzleId) {
  const puzzle = getPuzzleById(puzzleId);
  if (!puzzle) return;

  if (activePuzzleTimer.puzzleId !== puzzle.id) {
    flushPuzzleTimer();
    activePuzzleTimer.puzzleId = puzzle.id;
  }

  activePuzzleTimer.startedAt = Date.now();
  recordPuzzleTime(puzzle.id, 0);
}

function formatMinutes(seconds) {
  const minutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatMinutesSince(value) {
  return formatMinutes(secondsSince(value));
}

// -------------------------
// Puzzle API
// -------------------------
function requireUnlocked(puzzleId, options = {}) {
  const username = getCurrentUsername();
  if (!username) {
    navigateWithoutTransition("../index.html");
    return;
  }

  if (isAdminUsername(username)) {
    startPuzzleTimer(puzzleId);
    return;
  }

  const progress = loadProgress();
  const { unlockedUpTo } = progress;
  if (puzzleId !== INTRODUCTION_PUZZLE.id && !hasCompletedIntroduction(progress)) {
    if (remoteDatabaseUrl() && !options.afterSync) {
      showSyncGate();
      ensureRemoteDatabaseSyncedOnce().then(() => {
        hideSyncGate();
        requireUnlocked(puzzleId, { afterSync: true });
      });
      return;
    }
    navigateWithoutTransition("introduction.html");
    return;
  }
  if (puzzleId > unlockedUpTo) {
    if (remoteDatabaseUrl() && !options.afterSync) {
      showSyncGate();
      ensureRemoteDatabaseSyncedOnce().then(() => {
        hideSyncGate();
        requireUnlocked(puzzleId, { afterSync: true });
      });
      return;
    }
    navigateWithoutTransition("../index.html");
    return;
  }

  startPuzzleTimer(puzzleId);
}

async function submitAnswer(puzzleId, inputValue) {
  const username = getCurrentUsername();
  if (!canUseCachedDatabaseForWrites()) {
    return { ok: false, msg: cloudUnavailableMessage("submitting answers") };
  }
  if (!username) {
    return { ok: false, msg: "Log in before submitting answers." };
  }
  if (isAdminUsername(username)) {
    return { ok: false, msg: "Admins can review puzzle answers but cannot submit answers." };
  }

  if (isSolved(puzzleId)) {
    return { ok: false, msg: "You already solved this puzzle. Resubmission is disabled." };
  }

  const guess = normalizeAnswer(inputValue);
  const puzzle = PUZZLES.find((p) => p.id === puzzleId);

  if (!puzzle) return { ok: false, msg: "Puzzle not found." };
  if (!guess) return { ok: false, msg: "Type an answer first." };

  if (guess === normalizeAnswer(puzzle.answer)) {
    const databaseBeforeSave = loadDatabase();
    const progress = loadProgress();
    const solved = new Set(progress.solvedIds);
    solved.add(puzzleId);

    progress.solvedIds = Array.from(solved);
    progress.solvedAtById = {
      ...(progress.solvedAtById || {}),
      [String(puzzleId)]: new Date().toISOString(),
    };
    progress.unlockedUpTo = Math.max(progress.unlockedUpTo, puzzleId + 1);
    if (!saveProgress(progress)) {
      return { ok: false, msg: cloudUnavailableMessage("submitting answers") };
    }

    const savedRemotely = remoteDatabaseUrl() ? await flushRemoteDatabasePush() : true;
    if (remoteDatabaseUrl() && CLOUD_DATABASE_REQUIRED && !savedRemotely) {
      saveDatabase(databaseBeforeSave, { skipRemote: true });
      return { ok: false, msg: cloudUnavailableMessage("submitting answers") };
    }

    const isIntroduction = puzzleId === INTRODUCTION_PUZZLE.id;
    const isLast = puzzleId === HUNT_PUZZLES[HUNT_PUZZLES.length - 1].id;
    const msg = isLast
      ? "Correct! Hunt complete ✨"
      : isIntroduction
        ? "Correct! Puzzle 1 is unlocked ✨"
        : "Correct! The next puzzle is unlocked ✨";
    queueSolveNotification(msg);
    return {
      ok: true,
      msg,
      redirectHome: true,
      syncPromise: Promise.resolve(savedRemotely),
    };
  }

  return { ok: false, msg: "Not quite — try again." };
}

function getPuzzleState(puzzleId) {
  const username = getCurrentUsername();
  const { unlockedUpTo, solvedIds } = loadProgress();
  const puzzle = PUZZLES.find((p) => p.id === puzzleId);
  const isAdmin = isAdminUsername(username);
  const solved = isAdmin || solvedIds.includes(puzzleId);

  return {
    unlockedUpTo,
    solved,
    isAdmin,
    loggedIn: Boolean(username),
    answer: solved ? puzzle?.answer ?? "" : "",
  };
}

// -------------------------
// Home render
// -------------------------
function renderLeaderboard() {
  const leaderboardEl = document.getElementById("leaderboardList");
  if (!leaderboardEl) return;

  const rows = getLeaderboard();
  leaderboardEl.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "leaderboard-empty";
    empty.textContent = "No players yet. Create an account to claim the first spot.";
    leaderboardEl.appendChild(empty);
    return;
  }

  for (const player of rows) {
    const item = document.createElement("li");
    item.className = "leaderboard-row";

    const name = document.createElement("span");
    name.className = "leaderboard-name";
    name.textContent = player.username;

    const score = document.createElement("span");
    score.className = "leaderboard-score";
    score.textContent = `${player.solvedCount} / ${HUNT_PUZZLES.length} puzzle pages solved`;

    item.appendChild(name);
    item.appendChild(score);
    leaderboardEl.appendChild(item);
  }
}


function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function showMessageDialog(title, message, eyebrow = "Hint response") {
  const dialog = document.createElement("dialog");
  dialog.className = "message-dialog";
  dialog.innerHTML = `
    <div class="message-window">
      <div class="leaderboard-window-header">
        <div>
          <p class="eyebrow"></p>
          <h2></h2>
        </div>
        <button class="secondary icon-button" type="button" aria-label="Close">×</button>
      </div>
      <p class="message-copy"></p>
      <div class="row"><button type="button">OK</button></div>
    </div>
  `;
  dialog.querySelector(".eyebrow").textContent = eyebrow;
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector(".message-copy").textContent = message;

  const closeButtons = dialog.querySelectorAll("button");
  closeButtons.forEach((button) => button.addEventListener("click", () => closeDialog(dialog)));
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog(dialog);
  });
  dialog.addEventListener("close", () => dialog.remove());

  document.body.appendChild(dialog);
  openDialog(dialog);
}

function showPendingHintResponses() {
  const responses = getUnseenHintResponses();
  if (!responses.length) return;

  markHintResponsesSeen(responses.map((response) => response.id));
  responses.forEach((response, index) => {
    setTimeout(() => {
      if (response.status === "denied") {
        showMessageDialog(
          `Your Hint Request for Puzzle ${response.puzzleId} Has been DENYED`,
          `Your Hint Request for Puzzle ${response.puzzleId} Has been DENYED`
        );
      } else {
        showMessageDialog(
          `Your Hint Request for Puzzle ${response.puzzleId} has been APPROVED`,
          `Your personalized hint: ${response.responseText}`
        );
      }
    }, index * 250);
  });
}

function formatRequestDate(value) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function renderPuzzleHintPanel(puzzleId) {
  const button = document.getElementById("requestHintBtn");
  const answerSection = button?.closest(".answer-section");
  if (!answerSection || isAdminUsername(getCurrentUsername())) return;

  let panel = document.getElementById("puzzleHintPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "puzzleHintPanel";
    panel.className = "puzzle-hint-panel";
    answerSection.appendChild(panel);
  }

  const todaysRequest = getTodaysHintRequest();
  const requests = getHintRequestsForPuzzle(puzzleId);
  const approved = requests.filter((request) => request.status === "approved" && request.responseText);
  const publicHints = getPublicHintsForPuzzle(puzzleId);

  panel.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Hints";

  const limit = document.createElement("p");
  limit.className = "hint-limit-note";
  limit.textContent = todaysRequest
    ? "You have already used today’s hint request. You can request another hint tomorrow."
    : "You can request one personalized hint per day.";

  panel.appendChild(title);
  panel.appendChild(limit);

  if (!approved.length && !publicHints.length) {
    const empty = document.createElement("p");
    empty.className = "hint-history-empty";
    empty.textContent = requests.length
      ? "No approved hints for this puzzle yet. Approved and public hints will stay here after their popups are closed."
      : "Approved and public hints for this puzzle will appear here when available.";
    panel.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "hint-history-list";
  for (const hint of publicHints) {
    const item = document.createElement("li");
    item.className = "public-hint-item";

    const heading = document.createElement("strong");
    heading.textContent = `Public hint/clarification posted ${formatRequestDate(hint.createdAt)}`;

    const body = document.createElement("p");
    body.textContent = hint.content;

    item.appendChild(heading);
    item.appendChild(body);
    list.appendChild(item);
  }
  for (const request of approved) {
    const item = document.createElement("li");

    const heading = document.createElement("strong");
    heading.textContent = `Approved ${formatRequestDate(request.decidedAt || request.createdAt)}`;

    const body = document.createElement("p");
    body.textContent = `Your personalized hint: ${request.responseText}`;

    item.appendChild(heading);
    item.appendChild(body);
    list.appendChild(item);
  }
  panel.appendChild(list);
}

function showHintRequestDialog(puzzleId) {
  const dialog = document.createElement("dialog");
  dialog.className = "message-dialog";
  dialog.innerHTML = `
    <form class="message-window hint-request-form" method="dialog">
      <div class="leaderboard-window-header">
        <div>
          <p class="eyebrow">Request a hint</p>
          <h2>Hint request</h2>
        </div>
        <button class="secondary icon-button" value="cancel" type="button" aria-label="Close">×</button>
      </div>
      <label>
        <span>Please tell us your thought process so far so we can provide a personalized hint. You can request one hint per day, and requests can be denied.</span>
        <textarea class="input hint-request-textarea" rows="7" required></textarea>
      </label>
      <p class="feedback" role="status" aria-live="polite"></p>
      <div class="row">
        <button type="submit">Send Hint Request</button>
        <button class="secondary" type="button">Cancel</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector("form");
  const textarea = dialog.querySelector("textarea");
  const feedback = dialog.querySelector(".feedback");
  const closeButtons = dialog.querySelectorAll('button[type="button"]');

  closeButtons.forEach((button) => button.addEventListener("click", () => closeDialog(dialog)));
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog(dialog);
  });
  dialog.addEventListener("close", () => dialog.remove());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const res = requestHint(puzzleId, textarea.value);
    if (!res.ok) {
      setFeedback(feedback, false, res.msg);
      return;
    }

    closeDialog(dialog);
    renderPuzzleHintPanel(puzzleId);
    showNotification(res.msg, "ok");
  });

  document.body.appendChild(dialog);
  openDialog(dialog);
  textarea.focus();
}

function bindHintRequestButton(puzzleId) {
  const button = document.getElementById("requestHintBtn");
  if (!button || button.dataset.bound) return;
  if (isAdminUsername(getCurrentUsername())) {
    button.hidden = true;
    return;
  }

  button.dataset.bound = "true";
  document.body.dataset.puzzleId = String(puzzleId);
  renderPuzzleHintPanel(puzzleId);
  button.addEventListener("click", () => {
    if (!getCurrentUsername()) {
      showNotification("Log in before requesting a hint.", "info");
      return;
    }

    const todaysRequest = getTodaysHintRequest();
    if (todaysRequest) {
      showNotification("You can request one hint per day. Please try again tomorrow.", "info");
      renderPuzzleHintPanel(puzzleId);
      return;
    }

    showHintRequestDialog(puzzleId);
  });
}

function openLeaderboardDialog(dialog) {
  renderLeaderboard();
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeLeaderboardDialog(dialog) {
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function bindLeaderboardDialog() {
  const openBtn = document.getElementById("openLeaderboardBtn");
  const closeBtn = document.getElementById("closeLeaderboardBtn");
  const dialog = document.getElementById("leaderboardDialog");

  if (openBtn && dialog && !openBtn.dataset.bound) {
    openBtn.dataset.bound = "true";
    openBtn.addEventListener("click", () => openLeaderboardDialog(dialog));
  }

  if (closeBtn && dialog && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "true";
    closeBtn.addEventListener("click", () => closeLeaderboardDialog(dialog));
  }

  if (dialog && !dialog.dataset.bound) {
    dialog.dataset.bound = "true";
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeLeaderboardDialog(dialog);
    });
  }
}

function setFeedback(element, ok, msg) {
  if (!element) return;
  element.textContent = msg;
  element.classList.remove("ok", "bad");
  element.classList.add(ok ? "ok" : "bad");
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function renderPuzzleCards(listEl, puzzles, solvedSet, isAdmin) {
  if (!listEl) return;
  listEl.innerHTML = "";

  for (const p of puzzles) {
    const solved = solvedSet.has(p.id);
    const li = document.createElement("li");
    li.className = "card" + (p.kind === "Meta" ? " card-meta-puzzle" : p.kind === "Introduction" ? " card-introduction-puzzle" : "");

    const index = document.createElement("span");
    index.className = "card-index";
    index.textContent = p.kind === "Meta" ? "META" : p.kind === "Introduction" ? "START" : String(p.id).padStart(2, "0");

    const name = document.createElement("h3");
    name.className = "puzzle-name";
    name.textContent = p.title;

    const label = document.createElement("p");
    label.className = "card-label";
    label.textContent = p.kind === "Meta" ? "Final metapuzzle" : p.kind === "Introduction" ? "Required onboarding puzzle" : "Main hunt puzzle";

    const badge = document.createElement("span");
    badge.className = "badge " + (solved ? "solved" : "unlocked");
    badge.textContent = solved ? "Solved" : isAdmin ? "Admin" : "Available";

    const open = document.createElement("a");
    open.className = "button";
    open.textContent = solved || isAdmin ? "Review" : "Open puzzle";
    open.href = p.path;

    li.appendChild(index);
    li.appendChild(name);
    li.appendChild(label);
    li.appendChild(badge);
    li.appendChild(open);
    listEl.appendChild(li);
  }
}

function renderAdminPanel() {
  const panel = document.getElementById("adminPanel");
  const list = document.getElementById("adminUserList");
  const hintList = document.getElementById("adminHintList");
  const publicHintList = document.getElementById("adminPublicHintList");
  const adminPuzzleList = document.getElementById("adminPuzzleList");
  const isAdmin = isCurrentUserAdmin();

  if (panel) panel.hidden = !isAdmin;
  if (list) list.innerHTML = "";
  if (hintList) hintList.innerHTML = "";
  if (publicHintList) publicHintList.innerHTML = "";
  if (adminPuzzleList) adminPuzzleList.innerHTML = "";
  if (!isAdmin) return;

  const rows = getPlayerRows()
    .map((user) => ({
      ...user,
      progress: sanitizeProgress(user.progress),
      hintRequests: getUserHintRequests(user),
      puzzleStats: sanitizePuzzleStats(user.puzzleStats),
    }))
    .sort((a, b) => a.username.localeCompare(b.username));
  const publicHints = getPublicHints();
  const requests = rows.flatMap((user) => user.hintRequests.map((request) => ({ ...request, username: user.username })));
  requests.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const pendingCount = requests.filter((request) => request.status === "pending").length;

  setText("adminHintCount", `${pendingCount} pending · ${requests.length} total`);
  setText("adminPublicHintCount", `${publicHints.length} posted`);
  setText("adminUserCount", `${rows.length} player${rows.length === 1 ? "" : "s"}`);
  setText("adminPuzzleCount", `${PUZZLES.length} pages (${MAIN_PUZZLES.length} puzzles + metapuzzle + introduction)`);
  renderPuzzleCards(adminPuzzleList, PUZZLES, new Set(loadProgress().solvedIds), true);

  if (list) {
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.className = "admin-user-empty";
      empty.textContent = "No player accounts exist yet.";
      list.appendChild(empty);
    } else {
      for (const user of rows) {
        const item = document.createElement("li");
        item.className = "admin-user-row";

        const summary = document.createElement("div");
        summary.className = "admin-user-summary";

        const name = document.createElement("strong");
        name.textContent = user.username;

        const details = document.createElement("span");
        details.textContent = `${user.progress.solvedIds.filter((id) => id !== INTRODUCTION_PUZZLE.id).length} / ${HUNT_PUZZLES.length} puzzle pages solved`;

        const currentPuzzle = document.createElement("span");
        currentPuzzle.className = "admin-current-puzzle";
        currentPuzzle.textContent = formatCurrentPuzzleStatus(user);

        const timeList = document.createElement("ul");
        timeList.className = "admin-time-list";
        const timeRows = Object.values(user.puzzleStats)
          .sort((a, b) => a.puzzleId - b.puzzleId);
        if (!timeRows.length) {
          const timeItem = document.createElement("li");
          timeItem.textContent = "No puzzles opened yet.";
          timeList.appendChild(timeItem);
        } else {
          for (const stat of timeRows) {
            const timeItem = document.createElement("li");
            timeItem.textContent = `Puzzle ${stat.puzzleId}: ${formatMinutesSince(stat.firstOpenedAt)} since first opened`;
            timeList.appendChild(timeItem);
          }
        }

        const button = document.createElement("button");
        button.className = "danger";
        button.type = "button";
        button.textContent = "Delete account";
        button.dataset.deleteUser = user.username;

        summary.appendChild(name);
        summary.appendChild(details);
        summary.appendChild(currentPuzzle);
        summary.appendChild(timeList);
        item.appendChild(summary);
        item.appendChild(button);
        list.appendChild(item);
      }
    }
  }

  if (publicHintList) {
    if (!publicHints.length) {
      const empty = document.createElement("li");
      empty.className = "admin-user-empty";
      empty.textContent = "No public hints or clarifications have been posted yet.";
      publicHintList.appendChild(empty);
    } else {
      for (const hint of publicHints) {
        const item = document.createElement("li");
        item.className = "hint-request-row";

        const title = document.createElement("strong");
        title.textContent = `Puzzle ${hint.puzzleId}: ${hint.puzzleTitle}`;

        const date = document.createElement("span");
        date.className = "hint-status approved";
        date.textContent = formatRequestDate(hint.createdAt);

        const content = document.createElement("p");
        content.className = "hint-progress";
        content.textContent = hint.content;

        const revoke = document.createElement("button");
        revoke.className = "danger";
        revoke.type = "button";
        revoke.textContent = "Revoke";
        revoke.dataset.revokePublicHint = hint.id;

        item.appendChild(title);
        item.appendChild(date);
        item.appendChild(content);
        item.appendChild(revoke);
        publicHintList.appendChild(item);
      }
    }
  }

  if (!hintList) return;

  if (!requests.length) {
    const empty = document.createElement("li");
    empty.className = "admin-user-empty";
    empty.textContent = "No hint requests have been submitted yet.";
    hintList.appendChild(empty);
    return;
  }

  for (const request of requests) {
    const item = document.createElement("li");
    item.className = "hint-request-row";

    const title = document.createElement("strong");
    title.textContent = `${request.username} — Puzzle ${request.puzzleId}: ${request.puzzleTitle}`;

    const status = document.createElement("span");
    status.className = `hint-status ${request.status}`;
    status.textContent = request.status.toUpperCase();

    const progress = document.createElement("p");
    progress.className = "hint-progress";
    progress.textContent = request.progressText;

    item.appendChild(title);
    item.appendChild(status);
    item.appendChild(progress);

    if (request.status === "pending") {
      const actions = document.createElement("div");
      actions.className = "hint-actions";

      const approveBox = document.createElement("textarea");
      approveBox.className = "input hint-response-input";
      approveBox.rows = 3;
      approveBox.placeholder = "Write a personalized hint...";
      approveBox.hidden = true;
      approveBox.dataset.hintResponseFor = request.id;

      const approve = document.createElement("button");
      approve.type = "button";
      approve.textContent = "APPROVE";
      approve.dataset.approveHint = request.id;

      const send = document.createElement("button");
      send.type = "button";
      send.textContent = "SEND";
      send.hidden = true;
      send.dataset.sendHint = request.id;
      send.dataset.hintUser = request.username;

      const deny = document.createElement("button");
      deny.className = "danger";
      deny.type = "button";
      deny.textContent = "DENY";
      deny.dataset.denyHint = request.id;
      deny.dataset.hintUser = request.username;

      actions.appendChild(approveBox);
      actions.appendChild(approve);
      actions.appendChild(send);
      actions.appendChild(deny);
      item.appendChild(actions);
    } else if (request.responseText) {
      const response = document.createElement("p");
      response.className = "hint-response";
      response.textContent = `Response: ${request.responseText}`;
      item.appendChild(response);
    }

    hintList.appendChild(item);
  }
}

function renderIndex() {
  const authPanel = document.getElementById("authPanel");
  const huntPanel = document.getElementById("huntPanel");
  const listEl = document.getElementById("puzzleList");
  const accountEl = document.getElementById("accountText");
  const progressEl = document.getElementById("progressText");
  const revealEl = document.getElementById("revealText");
  const logoutBtn = document.getElementById("logoutBtn");
  const resetBtn = document.getElementById("resetBtn");
  const username = getCurrentUsername();
  const isAdmin = isCurrentUserAdmin();

  renderLeaderboard();
  renderAdminPanel();

  if (authPanel) authPanel.hidden = Boolean(username);
  if (huntPanel) huntPanel.hidden = !username || isAdmin;
  if (logoutBtn) logoutBtn.hidden = !username;
  if (resetBtn) resetBtn.hidden = !username || isAdmin;
  if (accountEl) accountEl.textContent = username ? `Logged in as ${username}` : "Not logged in";

  if (!username) {
    if (progressEl) progressEl.textContent = "Log in to save progress";
    if (revealEl) revealEl.textContent = "A username and password are required before you can open puzzles.";
    if (listEl) listEl.innerHTML = "";
    return;
  }

  if (!listEl) return;

  const progress = loadProgress();
  const { unlockedUpTo, solvedIds } = progress;
  const solvedSet = new Set(solvedIds);
  const introComplete = hasCompletedIntroduction(progress);
  const visible = isAdmin
    ? PUZZLES
    : introComplete
      ? [INTRODUCTION_PUZZLE, ...HUNT_PUZZLES.filter((p) => p.id <= unlockedUpTo)]
      : [INTRODUCTION_PUZZLE];
  const nextPuzzle = introComplete
    ? HUNT_PUZZLES.find((p) => !solvedSet.has(p.id))
    : INTRODUCTION_PUZZLE;
  const solvedMainPuzzleCount = MAIN_PUZZLES.filter((p) => solvedSet.has(p.id)).length;

  if (progressEl) {
    progressEl.textContent = isAdmin
      ? `Admin access: ${PUZZLES.length} pages visible`
      : introComplete
        ? `${solvedMainPuzzleCount} of ${MAIN_PUZZLES.length} puzzles solved${solvedSet.has(HUNT_PUZZLES[HUNT_PUZZLES.length - 1].id) ? " · metapuzzle solved" : ""}`
        : "Complete the introduction to unlock the puzzle board";
  }
  if (revealEl) {
    revealEl.textContent = isAdmin
      ? "All puzzles are available for review, and admin tools are enabled."
      : !introComplete
        ? "Open the introduction, enter its answer, and then the hunt puzzles will unlock."
        : nextPuzzle
          ? `${nextPuzzle.kind === "Meta" ? "The metapuzzle" : nextPuzzle.title} is available now.`
          : "Every hunt puzzle is solved. Congratulations!";
  }

  renderPuzzleCards(listEl, visible, solvedSet, isAdmin);
}

function showPublicHintDialog() {
  const dialog = document.createElement("dialog");
  dialog.className = "message-dialog";
  dialog.innerHTML = `
    <form class="message-window public-hint-form" method="dialog">
      <div class="leaderboard-window-header">
        <div>
          <p class="eyebrow">Public hint/clarification</p>
          <h2>Post public hint</h2>
        </div>
        <button class="secondary icon-button" value="cancel" type="button" aria-label="Close">×</button>
      </div>
      <label>
        <span>Puzzle</span>
        <select class="input public-hint-puzzle" required></select>
      </label>
      <label>
        <span>Hint or clarification content</span>
        <textarea class="input hint-request-textarea" rows="7" required></textarea>
      </label>
      <p class="feedback" role="status" aria-live="polite"></p>
      <div class="row">
        <button type="submit">Post Public Hint/Clarification</button>
        <button class="secondary" type="button">Cancel</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector("form");
  const select = dialog.querySelector("select");
  const textarea = dialog.querySelector("textarea");
  const feedback = dialog.querySelector(".feedback");
  const closeButtons = dialog.querySelectorAll('button[type="button"]');

  for (const puzzle of PUZZLES.filter((puzzle) => puzzle.allowHints !== false)) {
    const option = document.createElement("option");
    option.value = puzzle.id;
    option.textContent = `${puzzle.kind === "Meta" ? "Metapuzzle" : `Puzzle ${puzzle.id}`} — ${puzzle.title}`;
    select.appendChild(option);
  }

  closeButtons.forEach((button) => button.addEventListener("click", () => closeDialog(dialog)));
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeDialog(dialog);
  });
  dialog.addEventListener("close", () => dialog.remove());
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const res = postPublicHint(select.value, textarea.value);
    if (!res.ok) {
      setFeedback(feedback, false, res.msg);
      return;
    }

    closeDialog(dialog);
    renderIndex();
    showNotification(res.msg, "ok");
  });

  document.body.appendChild(dialog);
  openDialog(dialog);
  textarea.focus();
}

function bindAdminPublicHintButton() {
  const button = document.getElementById("postPublicHintBtn");
  if (!button || button.dataset.bound) return;

  button.dataset.bound = "true";
  button.addEventListener("click", () => {
    if (!isCurrentUserAdmin()) return;
    showPublicHintDialog();
  });
}

function bindAdminWindowControls() {
  const windowButtons = [
    ["openAdminHintsBtn", "adminHintsDialog"],
    ["openAdminPublicHintsBtn", "adminPublicHintsDialog"],
    ["openAdminUsersBtn", "adminUsersDialog"],
    ["openAdminPuzzlesBtn", "adminPuzzlesDialog"],
  ];

  for (const [buttonId, dialogId] of windowButtons) {
    const button = document.getElementById(buttonId);
    const dialog = document.getElementById(dialogId);
    if (!button || !dialog || button.dataset.bound) continue;

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      if (!isCurrentUserAdmin()) return;
      renderAdminPanel();
      openDialog(dialog);
    });
  }

  document.querySelectorAll(".admin-dialog").forEach((dialog) => {
    if (dialog.dataset.bound) return;
    dialog.dataset.bound = "true";
    dialog.addEventListener("click", (e) => {
      const closeButton = e.target.closest("[data-close-dialog]");
      if (closeButton) {
        closeDialog(dialog);
        return;
      }
      if (e.target === dialog) closeDialog(dialog);
    });
  });
}

function bindAuthControls() {
  const authForm = document.getElementById("authForm");
  const registerBtn = document.getElementById("registerBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const resetBtn = document.getElementById("resetBtn");
  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const feedbackEl = document.getElementById("authFeedback");
  const adminUserList = document.getElementById("adminUserList");
  const adminPublicHintList = document.getElementById("adminPublicHintList");
  bindAdminPublicHintButton();
  bindAdminWindowControls();

  async function runAuth(action) {
    const username = usernameEl?.value ?? "";
    const password = passwordEl?.value ?? "";
    const submitButtons = [authForm?.querySelector('button[type="submit"]'), registerBtn].filter(Boolean);
    submitButtons.forEach((button) => { button.disabled = true; });
    setFeedback(feedbackEl, true, action === "register" ? "Creating and saving your account…" : "Checking the shared account database…");

    try {
      const res = action === "register"
        ? await createAccount(username, password)
        : await login(username, password);

      setFeedback(feedbackEl, res.ok, res.msg);
      if (res.ok) {
        if (passwordEl) passwordEl.value = "";
        renderIndex();
        showNotification(res.msg, "ok");
        if (action === "register" && !isCurrentUserAdmin()) {
          setTimeout(() => navigateWithoutTransition(INTRODUCTION_PUZZLE.path), 550);
          return;
        }
        showPendingHintResponses();
        showPendingPublicHints();
      }
    } catch (error) {
      console.warn(error?.message || "Authentication failed unexpectedly.");
      setFeedback(feedbackEl, false, "The account request failed before it could be saved. Please refresh and try again.");
    } finally {
      submitButtons.forEach((button) => { button.disabled = false; });
    }
  }

  if (authForm && !authForm.dataset.bound) {
    authForm.dataset.bound = "true";
    authForm.addEventListener("submit", (e) => {
      e.preventDefault();
      runAuth("login");
    });
  }

  if (registerBtn && !registerBtn.dataset.bound) {
    registerBtn.dataset.bound = "true";
    registerBtn.addEventListener("click", () => runAuth("register"));
  }

  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = "true";
    logoutBtn.addEventListener("click", () => {
      const username = getCurrentUsername();
      logout();
      renderIndex();
      showNotification(username ? `Logged out of ${username}.` : "Logged out.", "info");
    });
  }

  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.dataset.bound = "true";
    resetBtn.addEventListener("click", () => {
      resetCurrentProgress();
      renderIndex();
      alert("Progress reset for the logged-in account.");
    });
  }

  if (adminPublicHintList && !adminPublicHintList.dataset.bound) {
    adminPublicHintList.dataset.bound = "true";
    adminPublicHintList.addEventListener("click", (e) => {
      const button = e.target.closest("[data-revoke-public-hint]");
      if (!button || !isCurrentUserAdmin()) return;

      if (!confirm("Revoke this public hint/clarification? Players will no longer see it.")) return;

      const res = revokePublicHint(button.dataset.revokePublicHint);
      renderIndex();
      showNotification(res.msg, res.ok ? "ok" : "info");
    });
  }

  if (adminUserList && !adminUserList.dataset.bound) {
    adminUserList.dataset.bound = "true";
    adminUserList.addEventListener("click", (e) => {
      const button = e.target.closest("[data-delete-user]");
      if (!button || !isCurrentUserAdmin()) return;

      const username = button.dataset.deleteUser;
      if (!confirm(`Delete ${username}'s account and all saved progress?`)) return;

      const res = deleteUserAccount(username);
      renderIndex();
      showNotification(res.msg, res.ok ? "ok" : "info");
    });
  }

  const adminHintList = document.getElementById("adminHintList");
  if (adminHintList && !adminHintList.dataset.bound) {
    adminHintList.dataset.bound = "true";
    adminHintList.addEventListener("click", (e) => {
      if (!isCurrentUserAdmin()) return;

      const approveButton = e.target.closest("[data-approve-hint]");
      const sendButton = e.target.closest("[data-send-hint]");
      const denyButton = e.target.closest("[data-deny-hint]");

      if (approveButton) {
        const requestId = approveButton.dataset.approveHint;
        const responseBox = adminHintList.querySelector(`[data-hint-response-for="${CSS.escape(requestId)}"]`);
        const sendButtonForRequest = adminHintList.querySelector(`[data-send-hint="${CSS.escape(requestId)}"]`);
        if (responseBox) responseBox.hidden = false;
        if (sendButtonForRequest) sendButtonForRequest.hidden = false;
        approveButton.hidden = true;
        responseBox?.focus();
        return;
      }

      if (sendButton) {
        const requestId = sendButton.dataset.sendHint;
        const username = sendButton.dataset.hintUser;
        const responseBox = adminHintList.querySelector(`[data-hint-response-for="${CSS.escape(requestId)}"]`);
        const res = approveHintRequest(username, requestId, responseBox?.value ?? "");
        renderIndex();
        showNotification(res.msg, res.ok ? "ok" : "info");
        return;
      }

      if (denyButton) {
        const res = denyHintRequest(denyButton.dataset.hintUser, denyButton.dataset.denyHint);
        renderIndex();
        showNotification(res.msg, res.ok ? "ok" : "info");
      }
    });
  }
}

// -------------------------
// Init
// -------------------------
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    flushPuzzleTimer({ pause: true });
  } else {
    resumePuzzleTimer();
  }
});

window.addEventListener("beforeunload", () => {
  flushPuzzleTimer();
  if (remoteDatabaseUrl()) flushRemoteDatabasePush();
});

window.addEventListener("storage", (event) => {
  if (event.key !== DATABASE_KEY) return;
  showQueuedSolveNotification();
  showPendingHintResponses();
  showPendingPublicHints();
  const puzzleId = Number(document.body.dataset.puzzleId);
  if (puzzleId) renderPuzzleHintPanel(puzzleId);
  if (isCurrentUserAdmin()) renderAdminPanel();
});

document.addEventListener("DOMContentLoaded", () => {
  ensureOverlays();
  bindAuthControls();
  bindLeaderboardDialog();

  if (CLOUD_DATABASE_REQUIRED) showSyncGate("Loading shared cloud database…");

  ensureRemoteDatabaseSyncedOnce().then((synced) => {
    hideSyncGate();
    if (!synced && CLOUD_DATABASE_REQUIRED) {
      showNotification(cloudUnavailableMessage("account actions"), "info");
    }
    renderIndex();
    const puzzleId = Number(document.body.dataset.puzzleId);
    if (puzzleId) renderPuzzleHintPanel(puzzleId);
    showQueuedSolveNotification();
    showPendingHintResponses();
    showPendingPublicHints();
  });

  if (document.getElementById("adminPanel")) {
    setInterval(() => {
      if (isCurrentUserAdmin()) renderAdminPanel();
    }, 60000);
  }

  setInterval(() => {
    showPendingHintResponses();
    showPendingPublicHints();
    const puzzleHintPanel = document.getElementById("puzzleHintPanel");
    const puzzleId = Number(document.body.dataset.puzzleId);
    if (puzzleHintPanel && puzzleId) renderPuzzleHintPanel(puzzleId);
  }, 60000);

  if (remoteDatabaseUrl()) {
    setInterval(() => {
      syncDatabaseFromRemote().then((synced) => {
        if (!synced) return;
        renderIndex();
        const puzzleId = Number(document.body.dataset.puzzleId);
        if (puzzleId) renderPuzzleHintPanel(puzzleId);
      });
    }, REMOTE_SYNC_INTERVAL_MS);
  }
});

window.PuzzleHunt = {
  requireUnlocked,
  submitAnswer,
  getPuzzleState,
  navigateWithoutTransition,
  spawnCelebrationConfetti,
  bindHintRequestButton,
  renderPuzzleHintPanel,
  syncDatabaseFromRemote,
  cloudDatabaseStatus,
};
