// app.js — Puzzle Hunt logic with sequential unlocks, soft locking, and celebrations.

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

const STORAGE_KEY = "puzzle_hunt_progress_v10";

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
// Storage helpers
// -------------------------
function loadProgress() {
  const fallback = { unlockedUpTo: 1, solvedIds: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw);
    const unlockedUpTo = Number(parsed.unlockedUpTo);
    const solvedIds = Array.isArray(parsed.solvedIds) ? parsed.solvedIds : [];

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
  } catch {
    return fallback;
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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
  const { unlockedUpTo } = loadProgress();
  if (puzzleId > unlockedUpTo) {
    navigateWithTransition("../index.html");
  }
}

function submitAnswer(puzzleId, inputValue) {
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
  return { unlockedUpTo, solved: solvedIds.includes(puzzleId) };
}

// -------------------------
// Home render
// -------------------------
function renderIndex() {
  const listEl = document.getElementById("puzzleList");
  if (!listEl) return;

  const progressEl = document.getElementById("progressText");
  const revealEl = document.getElementById("revealText");
  const { unlockedUpTo, solvedIds } = loadProgress();
  const solvedSet = new Set(solvedIds);
  const visible = PUZZLES.filter((p) => p.id <= unlockedUpTo);
  const nextPuzzle = PUZZLES.find((p) => !solvedSet.has(p.id));

  if (progressEl) progressEl.textContent = `${solvedSet.size} of 12 solved`;
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

  const resetBtn = document.getElementById("resetBtn");
  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.dataset.bound = "true";
    resetBtn.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      renderIndex();
      alert("Progress reset on this device.");
    });
  }
}

// -------------------------
// Init
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  ensureOverlays();
  enableLinkTransitions();
  renderIndex();
});

window.PuzzleHunt = {
  requireUnlocked,
  submitAnswer,
  getPuzzleState,
  navigateWithTransition,
  spawnCelebrationConfetti,
};
