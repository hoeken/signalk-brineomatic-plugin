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

  for (const board of boards) {
    const state = board.state || "IDLE";
    const dotClass = STATE_CLASS[state] || "";

    const card = document.createElement("a");
    card.className = "card";
    card.href = boardUrl(board);

    const icon = document.createElement("img");
    icon.className = "icon";
    icon.src = "logo.png";
    icon.alt = "";

    const info = document.createElement("div");
    info.className = "info";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = board.name || board.host;

    const host = document.createElement("div");
    host.className = "host";
    host.textContent = board.host;

    const stateEl = document.createElement("div");
    stateEl.className = "state";
    const dot = document.createElement("span");
    dot.className = `dot ${dotClass}`.trim();
    const stateText = document.createElement("span");
    stateText.textContent = state.toLowerCase();
    stateEl.append(dot, stateText);

    info.append(name, host, stateEl);
    card.append(icon, info);
    grid.append(card);
  }

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

  // Single board → go straight to it (full-page redirect avoids any iframe /
  // X-Frame-Options issues). Multiple → show a picker grid.
  if (boards.length === 1) {
    location.replace(boardUrl(boards[0]));
    return;
  }

  renderGrid(boards);
}

main();
