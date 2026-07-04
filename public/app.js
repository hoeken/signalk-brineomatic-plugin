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

main();
