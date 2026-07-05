// Landing page for the board proxy webapp. Reusable as-is in another SignalK
// plugin — only PLUGIN_ID (and the branding in index.html/style.css) changes.
const PLUGIN_ID = "signalk-brineomatic-plugin";

// Map a yarrboard-client connection state to a status-dot severity class.
const STATE_CLASS = {
  CONNECTED: "ok",
  CONNECTING: "warn",
  RETRYING: "warn",
  FAILED: "bad",
  IDLE: "",
};

function boardUrl(board) {
  // Reuse whatever host the user reached this page on (Tailscale IP, LAN name,
  // mDNS, …) and only swap the port — so the link works over any of them.
  return `${location.protocol}//${location.hostname}:${board.proxy_port}/`;
}

function setStatus(text, isError) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.hidden = false;
  el.classList.toggle("error", Boolean(isError));
}

function renderGrid(boards) {
  const grid = document.getElementById("grid");

  // Lay out the static structure with a template, then fill the dynamic
  // fields via textContent/.href so the DOM escapes untrusted board values.
  grid.innerHTML = boards.map(() => `
    <a class="card">
      <img class="icon" src="logo.png" alt="">
      <div class="info">
        <div class="name"></div>
        <div class="host"></div>
        <div class="state"><span class="dot"></span><span class="state-text"></span></div>
      </div>
    </a>
  `).join("");

  grid.querySelectorAll(".card").forEach((card, i) => {
    const board = boards[i];
    const state = board.state || "IDLE";
    card.href = boardUrl(board);
    card.querySelector(".name").textContent = board.name || board.host;
    card.querySelector(".host").textContent = board.host;
    card.querySelector(".dot").className = `dot ${STATE_CLASS[state] || ""}`.trim();
    card.querySelector(".state-text").textContent = state.toLowerCase();
  });

  document.getElementById("status").hidden = true;
  grid.hidden = false;
}

// Light/dark toggle. The head script applies any saved override before paint;
// this only manages the footer button and persistence. With no override we
// follow the OS setting via prefers-color-scheme.
const THEME_KEY = "brineomatic-theme";

const ICONS = {
  // A sun (shown while dark, i.e. "switch to light") and a moon (shown while
  // light). Both draw with currentColor so they inherit the button's color.
  light: '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>',
  dark: '<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 019.5 4a7 7 0 108.7 10.5c.5-.16.98.34.8.8-.16.4-.34.8-.55 1.2z"/></svg>',
};

function systemTheme() {
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") || systemTheme();
}

function renderThemeToggle() {
  const btn = document.getElementById("theme-toggle");
  if (!btn)
    return;
  const theme = currentTheme();
  const next = theme === "dark" ? "light" : "dark";
  btn.querySelector(".icon").outerHTML = ICONS[next];
  btn.querySelector(".label").textContent = `${next} mode`;
  btn.setAttribute("aria-label", `Switch to ${next} mode`);
}

function initTheme() {
  const btn = document.getElementById("theme-toggle");
  if (!btn)
    return;

  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode, disabled cookies).
    }
    renderThemeToggle();
  });

  // Keep the label in sync if the OS flips while we're following it.
  window
    .matchMedia("(prefers-color-scheme: light)")
    .addEventListener("change", () => {
      if (!document.documentElement.getAttribute("data-theme"))
        renderThemeToggle();
    });

  renderThemeToggle();
}

async function main() {
  let boards;
  try {
    const res = await fetch(`/plugins/${PLUGIN_ID}/boards`);
    if (!res.ok)
      throw new Error(`HTTP ${res.status}`);
    boards = await res.json();
  } catch (err) {
    setStatus(`Could not load boards: ${err.message}`, true);
    return;
  }

  if (!Array.isArray(boards) || boards.length === 0) {
    setStatus("No boards have the remote-access proxy enabled. Enable it in the Brineomatic plugin settings.");
    return;
  }

  // Single board → go straight to it. location.assign navigates this frame in
  // place and keeps a history entry, so Back returns here. Multiple → picker grid.
  if (boards.length === 1) {
    location.assign(boardUrl(boards[0]));
    return;
  }

  renderGrid(boards);
}

initTheme();
main();
