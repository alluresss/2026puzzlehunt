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
const LEGACY_PROGRESS_KEY = "puzzle_hunt_progress_v10";

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
// Account database helpers
// -------------------------
function defaultProgress() {
  return { unlockedUpTo: 1, solvedIds: [] };
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

function loadLegacyProgress() {
  try {
    const raw = localStorage.getItem(LEGACY_PROGRESS_KEY);
    return raw ? sanitizeProgress(JSON.parse(raw)) : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

function loadProgress() {
  const username = getCurrentUsername();
  if (!username) return defaultProgress();

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

  const database = loadDatabase();
  const key = usernameKey(validation.username);
  if (database.users[key]) {
    return { ok: false, msg: "That username already exists. Log in instead." };
  }

  database.users[key] = {
    username: validation.username,
    passwordHash: await hashPassword(validation.username, validation.password),
    progress: loadLegacyProgress(),
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
  if (!username) return false;
  return saveProgress(defaultProgress());
}

function getLeaderboard() {
  const database = loadDatabase();
  return Object.values(database.users)
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

function normalizeAnswer(s) {
  return (s ?? "").toString().trim().toUpperCase().replace(/\s+/g, " ");
}

function isSolved(puzzleId) {
  return loadProgress().solvedIds.includes(puzzleId);
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
  }
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
  return { unlockedUpTo, solved: solvedIds.includes(puzzleId), loggedIn: Boolean(getCurrentUsername()) };
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

function setFeedback(element, ok, msg) {
  if (!element) return;
  element.textContent = msg;
  element.classList.remove("ok", "bad");
  element.classList.add(ok ? "ok" : "bad");
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

  renderLeaderboard();

  if (authPanel) authPanel.hidden = Boolean(username);
  if (huntPanel) huntPanel.hidden = !username;
  if (logoutBtn) logoutBtn.hidden = !username;
  if (resetBtn) resetBtn.hidden = !username;
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
  const visible = PUZZLES.filter((p) => p.id <= unlockedUpTo);
  const nextPuzzle = PUZZLES.find((p) => !solvedSet.has(p.id));

  if (progressEl) progressEl.textContent = `${solvedSet.size} of ${PUZZLES.length} solved`;
  if (revealEl) {
    revealEl.textContent = nextPuzzle
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
    badge.textContent = solved ? "Solved" : "Available";

    const open = document.createElement("a");
    open.className = "button";
    open.textContent = solved ? "Review" : "Open puzzle";
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
      logout();
      renderIndex();
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
}

// -------------------------
// Init
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  ensureOverlays();
  enableLinkTransitions();
  bindAuthControls();
  renderIndex();
});

window.PuzzleHunt = {
  requireUnlocked,
  submitAnswer,
  getPuzzleState,
  navigateWithTransition,
  spawnCelebrationConfetti,
};
