// app.js — Puzzle Hunt logic with account-based progress, sequential unlocks, and celebrations.

const PUZZLES = [
  { id: 1, title: "The Red Fruit", path: "puzzles/puzzle1.html", answer: "APPLE", kind: "Puzzle" },
  { id: 2, title: "Orange Identity", path: "puzzles/puzzle2.html", answer: "ORANGE", kind: "Puzzle" },
  { id: 3, title: "Banana Business", path: "puzzles/puzzle3.html", answer: "BANANA", kind: "Puzzle" },
  { id: 4, title: "Puzzle 4", path: "puzzles/puzzle4.html", answer: "PUZZLE4", kind: "Puzzle" },
  { id: 5, title: "Puzzle 5", path: "puzzles/puzzle5.html", answer: "PUZZLE5", kind: "Puzzle" },
  { id: 6, title: "Puzzle 6", path: "puzzles/puzzle6.html", answer: "PUZZLE6", kind: "Puzzle" },
  { id: 7, title: "Puzzle 7", path: "puzzles/puzzle7.html", answer: "PUZZLE7", kind: "Puzzle" },
  { id: 8, title: "Puzzle 8", path: "puzzles/puzzle8.html", answer: "PUZZLE8", kind: "Puzzle" },
  { id: 9, title: "Puzzle 9", path: "puzzles/puzzle9.html", answer: "PUZZLE9", kind: "Puzzle" },
  { id: 10, title: "Puzzle 10", path: "puzzles/puzzle10.html", answer: "PUZZLE10", kind: "Puzzle" },
  { id: 11, title: "Puzzle 11", path: "puzzles/puzzle11.html", answer: "PUZZLE11", kind: "Puzzle" },
  { id: 12, title: "Metapuzzle", path: "puzzles/metapuzzle.html", answer: "META", kind: "Meta" },
];

const DATABASE_KEY = "puzzle_hunt_database_v1";
const SESSION_KEY = "puzzle_hunt_current_user_v1";
const ADMIN_ACCOUNT = { username: "easonadmin", password: "adminadmin" };
const HINT_EMAIL = "easond29@lakesideschool.org";
const HINT_EMAIL_ENDPOINT = `https://formsubmit.co/ajax/${HINT_EMAIL}`;

// -------------------------
// Overlays (confetti + transition only)
// -------------------------
function ensureOverlays() {
  if (!document.getElementById("confettiLayer")) {
    const c = document.createElement("div");
    c.id = "confettiLayer";
    document.body.appendChild(c);
  }
  if (!document.getElementById("pageTransition")) {
    const t = document.createElement("div");
    t.id = "pageTransition";
    document.body.appendChild(t);
  }
}

function navigateWithTransition(href) {
  ensureOverlays();
  document.body.classList.add("pt-out");
  setTimeout(() => {
    window.location.href = href;
  }, 420);
}

// Intercept same-site links for smooth transitions.
function enableLinkTransitions() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a || !a.href) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    if (a.getAttribute("aria-disabled") === "true") return;

    const url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin) return;

    e.preventDefault();
    navigateWithTransition(url.href);
  });
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

// -------------------------
// Account database helpers
// -------------------------
function defaultProgress() {
  return { unlockedUpTo: 1, solvedIds: [] };
}

function defaultHintRequests() {
  return [];
}

function defaultPuzzleStats() {
  return {};
}

function defaultDatabase() {
  return { version: 1, users: {} };
}

function loadDatabase() {
  try {
    const raw = localStorage.getItem(DATABASE_KEY);
    if (!raw) return defaultDatabase();

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.users || typeof parsed.users !== "object") {
      return defaultDatabase();
    }

    return { version: 1, users: parsed.users };
  } catch {
    return defaultDatabase();
  }
}

function saveDatabase(database) {
  localStorage.setItem(DATABASE_KEY, JSON.stringify(database));
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

function isCurrentUserAdmin() {
  return isAdminUsername(sessionStorage.getItem(SESSION_KEY));
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

  if (!Number.isFinite(unlockedUpTo) || unlockedUpTo < 1) return fallback;

  const solvedSet = new Set(
    solvedIds
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= PUZZLES.length)
  );

  return {
    unlockedUpTo: Math.min(unlockedUpTo, PUZZLES.length + 1),
    solvedIds: Array.from(solvedSet),
  };
}

function loadProgress() {
  const username = getCurrentUsername();
  if (!username) return defaultProgress();
  if (isAdminUsername(username)) return { unlockedUpTo: PUZZLES.length, solvedIds: [] };

  const database = loadDatabase();
  const user = database.users[usernameKey(username)];
  return sanitizeProgress(user?.progress);
}

function saveProgress(progress) {
  const username = getCurrentUsername();
  if (!username) return false;

  const database = loadDatabase();
  const key = usernameKey(username);
  if (!database.users[key]) return false;

  database.users[key].progress = sanitizeProgress(progress);
  database.users[key].updatedAt = new Date().toISOString();
  saveDatabase(database);
  return true;
}

async function createAccount(username, password) {
  const validation = validateCredentials(username, password);
  if (!validation.ok) return validation;
  if (isAdminUsername(validation.username)) {
    return { ok: false, msg: "That username is reserved for hunt administration." };
  }

  const database = loadDatabase();
  const key = usernameKey(validation.username);
  if (database.users[key]) {
    return { ok: false, msg: "That username already exists. Log in instead." };
  }

  database.users[key] = {
    username: validation.username,
    passwordHash: await hashPassword(validation.username, validation.password),
    progress: defaultProgress(),
    hintRequests: defaultHintRequests(),
    puzzleStats: defaultPuzzleStats(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveDatabase(database);
  setCurrentUsername(validation.username);
  return { ok: true, msg: `Welcome, ${validation.username}! Your account is ready.` };
}

async function login(username, password) {
  const validation = validateCredentials(username, password);
  if (!validation.ok) return validation;

  if (isAdminUsername(validation.username)) {
    if (validation.password !== ADMIN_ACCOUNT.password) return { ok: false, msg: "Incorrect password." };

    setCurrentUsername(ADMIN_ACCOUNT.username);
    return { ok: true, msg: "Welcome, admin. All puzzles and account tools are unlocked." };
  }

  const database = loadDatabase();
  const user = database.users[usernameKey(validation.username)];
  if (!user) return { ok: false, msg: "No account found for that username." };

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
  if (isAdminUsername(username)) return { ok: false, msg: "The admin account cannot be deleted." };

  const database = loadDatabase();
  const key = usernameKey(username);
  const user = database.users[key];
  if (!user) return { ok: false, msg: "That account no longer exists." };

  delete database.users[key];
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

        const totalSeconds = Number(rawStat.totalSeconds);
        return [String(puzzleId), {
          puzzleId,
          puzzleTitle: rawStat.puzzleTitle || puzzle.title,
          firstOpenedAt: rawStat.firstOpenedAt || "",
          lastOpenedAt: rawStat.lastOpenedAt || "",
          totalSeconds: Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0,
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

  return `Current puzzle: ${puzzleLabel} — ${formatDuration(secondsSince(currentStats.firstOpenedAt))} since first opened (${formatDuration(currentStats.totalSeconds)} tracked working time)`;
}

function getLeaderboard() {
  return getPlayerRows()
    .map((user) => {
      const progress = sanitizeProgress(user.progress);
      return {
        username: user.username,
        solvedCount: progress.solvedIds.length,
        updatedAt: user.updatedAt || user.createdAt || "",
      };
    })
    .sort((a, b) => {
      if (b.solvedCount !== a.solvedCount) return b.solvedCount - a.solvedCount;
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
  if (!username || !requestIds.length) return;

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

function normalizeAnswer(s) {
  return (s ?? "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

function isSolved(puzzleId) {
  return loadProgress().solvedIds.includes(puzzleId);
}

// -------------------------
// Puzzle time tracking
// -------------------------
const activePuzzleTimer = { puzzleId: null, startedAt: 0 };

function recordPuzzleTime(puzzleId, elapsedSeconds = 0) {
  const username = getCurrentUsername();
  const puzzle = getPuzzleById(puzzleId);
  if (!username || isAdminUsername(username) || !puzzle) return false;

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
    totalSeconds: 0,
  };

  stats[String(puzzle.id)] = {
    ...previous,
    puzzleTitle: puzzle.title,
    firstOpenedAt: previous.firstOpenedAt || now,
    lastOpenedAt: now,
    totalSeconds: previous.totalSeconds + Math.max(0, elapsedSeconds),
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
  if (!puzzle || isAdminUsername(getCurrentUsername())) return;

  if (activePuzzleTimer.puzzleId !== puzzle.id) {
    flushPuzzleTimer();
    activePuzzleTimer.puzzleId = puzzle.id;
  }

  activePuzzleTimer.startedAt = Date.now();
  recordPuzzleTime(puzzle.id, 0);
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

// -------------------------
// Puzzle API
// -------------------------
function requireUnlocked(puzzleId) {
  if (!getCurrentUsername()) {
    navigateWithTransition("../index.html");
    return;
  }

  const { unlockedUpTo } = loadProgress();
  if (puzzleId > unlockedUpTo) {
    navigateWithTransition("../index.html");
    return;
  }

  startPuzzleTimer(puzzleId);
}

function submitAnswer(puzzleId, inputValue) {
  if (!getCurrentUsername()) {
    return { ok: false, msg: "Log in before submitting answers." };
  }

  if (isSolved(puzzleId)) {
    return { ok: false, msg: "You already solved this puzzle. Resubmission is disabled." };
  }

  const guess = normalizeAnswer(inputValue);
  const puzzle = PUZZLES.find((p) => p.id === puzzleId);

  if (!puzzle) return { ok: false, msg: "Puzzle not found." };
  if (!guess) return { ok: false, msg: "Type an answer first." };

  if (guess === normalizeAnswer(puzzle.answer)) {
    const progress = loadProgress();
    const solved = new Set(progress.solvedIds);
    solved.add(puzzleId);

    progress.solvedIds = Array.from(solved);
    progress.unlockedUpTo = Math.max(progress.unlockedUpTo, puzzleId + 1);
    saveProgress(progress);

    const isLast = puzzleId === PUZZLES[PUZZLES.length - 1].id;
    return {
      ok: true,
      msg: isLast ? "Correct! Hunt complete ✨" : "Correct! Next puzzle unlocked ✨",
      redirectHome: true,
    };
  }

  return { ok: false, msg: "Not quite — try again." };
}

function getPuzzleState(puzzleId) {
  const { unlockedUpTo, solvedIds } = loadProgress();
  const solved = solvedIds.includes(puzzleId);
  const puzzle = PUZZLES.find((p) => p.id === puzzleId);

  return {
    unlockedUpTo,
    solved,
    loggedIn: Boolean(getCurrentUsername()),
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
    score.textContent = `${player.solvedCount} / ${PUZZLES.length} solved`;

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

function showMessageDialog(title, message) {
  const dialog = document.createElement("dialog");
  dialog.className = "message-dialog";
  dialog.innerHTML = `
    <div class="message-window">
      <div class="leaderboard-window-header">
        <div>
          <p class="eyebrow">Hint response</p>
          <h2></h2>
        </div>
        <button class="secondary icon-button" type="button" aria-label="Close">×</button>
      </div>
      <p class="message-copy"></p>
      <div class="row"><button type="button">OK</button></div>
    </div>
  `;
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

  if (!approved.length) {
    const empty = document.createElement("p");
    empty.className = "hint-history-empty";
    empty.textContent = requests.length
      ? "No approved hints for this puzzle yet. Approved hints will stay here after the popup is closed."
      : "Approved hints for this puzzle will appear here after the admin responds.";
    panel.appendChild(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "hint-history-list";
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

  button.dataset.bound = "true";
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

function renderAdminPanel() {
  const panel = document.getElementById("adminPanel");
  const list = document.getElementById("adminUserList");
  const hintList = document.getElementById("adminHintList");
  const isAdmin = isCurrentUserAdmin();

  if (panel) panel.hidden = !isAdmin;
  if (list) list.innerHTML = "";
  if (hintList) hintList.innerHTML = "";
  if (!isAdmin) return;

  const rows = getPlayerRows()
    .map((user) => ({
      ...user,
      progress: sanitizeProgress(user.progress),
      hintRequests: getUserHintRequests(user),
      puzzleStats: sanitizePuzzleStats(user.puzzleStats),
    }))
    .sort((a, b) => a.username.localeCompare(b.username));

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
        details.textContent = `${user.progress.solvedIds.length} / ${PUZZLES.length} solved`;

        const currentPuzzle = document.createElement("span");
        currentPuzzle.className = "admin-current-puzzle";
        currentPuzzle.textContent = formatCurrentPuzzleStatus(user);

        const timeList = document.createElement("ul");
        timeList.className = "admin-time-list";
        const timeRows = Object.values(user.puzzleStats)
          .sort((a, b) => a.puzzleId - b.puzzleId);
        if (!timeRows.length) {
          const timeItem = document.createElement("li");
          timeItem.textContent = "No puzzle time tracked yet.";
          timeList.appendChild(timeItem);
        } else {
          for (const stat of timeRows) {
            const timeItem = document.createElement("li");
            timeItem.textContent = `Puzzle ${stat.puzzleId}: ${formatDuration(stat.totalSeconds)} working time`;
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

  if (!hintList) return;

  const requests = rows.flatMap((user) => user.hintRequests.map((request) => ({ ...request, username: user.username })));
  requests.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

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
  if (huntPanel) huntPanel.hidden = !username;
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

  const { unlockedUpTo, solvedIds } = loadProgress();
  const solvedSet = new Set(solvedIds);
  const visible = isAdmin ? PUZZLES : PUZZLES.filter((p) => p.id <= unlockedUpTo);
  const nextPuzzle = PUZZLES.find((p) => !solvedSet.has(p.id));

  if (progressEl) {
    progressEl.textContent = isAdmin
      ? `Admin access: ${PUZZLES.length} puzzles visible`
      : `${solvedSet.size} of ${PUZZLES.length} solved`;
  }
  if (revealEl) {
    revealEl.textContent = isAdmin
      ? "All puzzles are available for review, and admin tools are enabled."
      : nextPuzzle
        ? `${nextPuzzle.kind === "Meta" ? "The metapuzzle" : nextPuzzle.title} is available now.`
        : "Every puzzle is solved. Congratulations!";
  }

  listEl.innerHTML = "";

  for (const p of visible) {
    const solved = solvedSet.has(p.id);
    const li = document.createElement("li");
    li.className = "card" + (p.kind === "Meta" ? " card-meta-puzzle" : "");

    const index = document.createElement("span");
    index.className = "card-index";
    index.textContent = p.kind === "Meta" ? "META" : String(p.id).padStart(2, "0");

    const name = document.createElement("h3");
    name.className = "puzzle-name";
    name.textContent = p.title;

    const label = document.createElement("p");
    label.className = "card-label";
    label.textContent = p.kind === "Meta" ? "Final metapuzzle" : "Main hunt puzzle";

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

function bindAuthControls() {
  const authForm = document.getElementById("authForm");
  const registerBtn = document.getElementById("registerBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const resetBtn = document.getElementById("resetBtn");
  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("password");
  const feedbackEl = document.getElementById("authFeedback");
  const adminUserList = document.getElementById("adminUserList");

  async function runAuth(action) {
    const username = usernameEl?.value ?? "";
    const password = passwordEl?.value ?? "";
    const res = action === "register"
      ? await createAccount(username, password)
      : await login(username, password);

    setFeedback(feedbackEl, res.ok, res.msg);
    if (res.ok) {
      if (passwordEl) passwordEl.value = "";
      renderIndex();
      showNotification(res.msg, "ok");
      showPendingHintResponses();
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

window.addEventListener("beforeunload", flushPuzzleTimer);

document.addEventListener("DOMContentLoaded", () => {
  ensureOverlays();
  enableLinkTransitions();
  bindAuthControls();
  bindLeaderboardDialog();
  renderIndex();
  showPendingHintResponses();
});

window.PuzzleHunt = {
  requireUnlocked,
  submitAnswer,
  getPuzzleState,
  navigateWithTransition,
  spawnCelebrationConfetti,
  bindHintRequestButton,
  renderPuzzleHintPanel,
};
