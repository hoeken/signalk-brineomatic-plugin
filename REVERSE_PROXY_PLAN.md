# Reverse Proxy — Implementation Plan

Goal: reach the Brineomatic web UI **remotely** (e.g. over Tailscale to the SignalK
host) even though the board is an ESP32 on the boat LAN that can't run Tailscale
itself. The plugin stands up a transparent HTTP + WebSocket reverse proxy to each
board, plus a discoverable landing page in the SignalK webapp list.

## Design decisions (settled)

- **One board → one dedicated port.** Each proxy serves the ESP32's webapp at
  root (`/`), so the board's own UI runs **unmodified** — no URL/base-path
  rewriting, and it always matches whatever firmware is flashed.
- **Discoverable landing page** registered as a SignalK webapp:
  - **Multiple boards** → grid of cards (name + icon + online status), each
    linking to that board's proxy URL.
  - **Single board** → transparent full-page redirect straight to its proxy URL.
- **Transparent proxy** (not a native re-implementation of the UI). The plugin
  already publishes `watermaker.*` data to SignalK; the proxy is only about
  serving the board's interactive webapp remotely.

## Architecture

```
Browser (remote, via Tailscale)
   │  http://<sk-host>:3000/<webapp>/         ← landing page (grid or redirect)
   │  http://<sk-host>:3000/plugins/signalk-brineomatic-plugin/boards  ← metadata JSON
   │
   │  http://<sk-host>:<proxy_port>/          ← transparent proxy, root path
   ▼
Plugin proxy server (one http.Server per board)
   │  proxy.web()  → board HTTP (static webapp assets)
   │  proxy.ws()   → board /ws   (live data + commands)
   ▼
ESP32 board  http(s)://<board.host>/  and  /ws
```

Note there are **two independent connections** to each board: the plugin's
existing `yarrboard-client` polling WS ([index.js:86-107](index.js#L86-L107)) and
the browser's proxied WS. See Risks re: the ESP32 connection-slot limit.

## Files to create / modify

| File | Change |
| --- | --- |
| `reverse-proxy.js` (new) | Encapsulates proxy server lifecycle (mirrors `signalk-bus.js` module style). |
| `index.js` | Schema fields; start/stop proxy lifecycle; `registerWithRouter` for `/boards`. |
| `public/index.html` (new) | Landing page shell. |
| `public/app.js` (new) | Fetch `/boards`, redirect (single) or render grid (multiple). |
| `public/style.css` (new) | Grid/card styling. |
| `public/icon.svg` (new) | Watermaker icon (also satisfies the "add icon" TODO). |
| `package.json` | Add `http-proxy` dependency; add `signalk-webapp` keyword. |
| `README.md` | Document proxy config + Tailscale remote-access usage. |
| `CHANGELOG.md` / `TODO` | Note feature; check off items on completion. |

## Implementation steps

### 1. Dependency + module (`reverse-proxy.js`)

Add `http-proxy` (lighter than `http-proxy-middleware`, gives direct control of
the `upgrade` event; WS-upgrade handling in a SignalK plugin is confirmed
workable).

```js
const http = require("http");
const httpProxy = require("http-proxy");

class BoardProxy {
  constructor(app, board, port) {
    this.app = app;
    this.board = board;      // {host, use_ssl, ...}
    this.port = port;
    this.server = null;
    this.proxy = null;
  }

  start() {
    const target = `${this.board.use_ssl ? "https" : "http"}://${this.board.host.trim()}`;
    this.proxy = httpProxy.createProxyServer({
      target,
      ws: true,
      changeOrigin: true,
      secure: false, // ESP32 SSL is typically self-signed
    });
    this.proxy.on("error", (err, req, res) => {
      if (res && res.writeHead && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`Brineomatic board unreachable: ${err.message}`);
      } else if (res && res.destroy) {
        res.destroy(); // socket (ws upgrade path)
      }
    });

    this.server = http.createServer((req, res) => this.proxy.web(req, res));
    this.server.on("upgrade", (req, socket, head) => this.proxy.ws(req, socket, head));
    this.server.on("error", (err) => {
      // e.g. EADDRINUSE — surface, don't crash the plugin
      this.app.setPluginError(`[${this.board.host}] proxy port ${this.port}: ${err.message}`);
    });
    this.server.listen(this.port);
  }

  close() {
    try { this.server && this.server.close(); } catch (e) { /* ignore */ }
    try { this.proxy && this.proxy.close(); } catch (e) { /* ignore */ }
    this.server = null;
    this.proxy = null;
  }
}

module.exports = { BoardProxy };
```

### 2. Schema (`index.js` `plugin.schema`)

Add per-board fields (keep them optional so existing configs keep working):

- `enable_proxy` (boolean, default `false`) — **opt-in**: no port opens until the
  user ticks the box for a board. Safer default; the port bypasses SignalK auth.
- `proxy_port` (number) — the listen port. **Explicit per-board** rather than
  auto-assigned-by-index, so the URL a user bookmarks over Tailscale stays stable
  when boards are added/removed/reordered. Suggest defaults like `3200`, `3201`, …
  in docs; validate for uniqueness at start().

No `bind_address` and no proxy-auth fields — see resolved questions below.

### 3. Lifecycle (`index.js` `plugin.start` / `plugin.stop`)

- `start()`: after creating each `YarrboardClient`, if `board.enable_proxy`,
  construct a `BoardProxy(app, board, board.proxy_port)` and `.start()` it. Store
  in `plugin.proxies = []`. Guard against duplicate ports (log + skip).
- `stop()`: in addition to closing connections, `for (const p of plugin.proxies) p.close()` and reset `plugin.proxies = []`.

### 4. Metadata endpoint (`index.js` `plugin.registerWithRouter`)

```js
plugin.registerWithRouter = function (router) {
  router.get("/boards", (req, res) => {
    res.json(plugin.connections
      .filter((yb) => yb.enable_proxy)      // stash enable_proxy/proxy_port on yb at create time
      .map((yb) => ({
        hostname: yb.hostname,
        boardname: yb.boardname,
        name: yb.config && yb.config.name ? yb.config.name : yb.boardname,
        proxy_port: yb.proxy_port,
        state: yb.status(),                 // "CONNECTED" / "RETRYING" / ...
      })));
  });
};
```

Served at `/plugins/signalk-brineomatic-plugin/boards`, **same origin** as the
webapp → no CORS needed. (Stash `enable_proxy` / `proxy_port` on the `yb` object
in `createYarrboard`, alongside the existing `yb.bus` / `yb.update_interval`.)

### 5. Landing webapp (`public/`)

- `package.json`: add `"signalk-webapp"` to `keywords` so the SignalK admin lists
  it. Confirm during impl how the combined plugin+webapp `public/` dir is served
  and at what URL (SignalK webapp convention).
- `app.js` logic:
  1. `fetch('/plugins/signalk-brineomatic-plugin/boards')`.
  2. Build each URL as `` `${location.protocol}//${location.hostname}:${port}/` ``
     (reuse the current hostname — works for Tailscale, LAN, mDNS alike; only the
     port changes).
  3. **1 board** → `window.location.replace(url)` (full-page redirect; avoids
     iframe/X-Frame-Options issues entirely).
  4. **>1 board** → render a grid of `<a href>` cards with name, `icon.svg`, and a
     status dot from `state`. Use links, **not iframes**, so the board's
     `X-Frame-Options` can't block them.

## Testing / verification

- Single board: open webapp entry → redirects to proxy → ESP32 UI loads; live
  data updates and controls (start/flush/etc.) work over the proxied WS.
- Multiple boards: grid lists all; each link opens the right board; status dots
  reflect connected/offline.
- Board offline: proxy returns 502 (not a hang); grid shows offline.
- Disable plugin / config change: ports are released cleanly (no `EADDRINUSE` on
  restart).
- SSL board (`use_ssl`): proxies over `https`/`wss` with `secure:false`.
- `require_login` board: the proxied webapp's own login flow works through the proxy.
- Remote path: reach all of the above via the Tailscale hostname, not just LAN.

## Resolved decisions

1. **Security boundary / binding** → **bind all interfaces (`0.0.0.0`)**, no
   `bind_address` field. The proxy is reachable over the Tailscale IP *and* the
   boat LAN; **document the LAN exposure** in the README. No proxy-level auth — the
   board's own `require_login` still applies through the transparent proxy, and the
   tailnet is the trust boundary. Combined with `enable_proxy` defaulting to
   **`false`** (opt-in), nothing is exposed unless the user asks for it.
2. **X-Frame-Options** — avoided by using redirect/links rather than iframes.
3. **Self-signed SSL** on the board → `secure:false` in the proxy.
4. **Port stability** — explicit per-board `proxy_port` (not index-derived).
5. **Webapp serving URL** — SignalK convention: `signalk-webapp` keyword + `public/`
   dir → served at `/<package-name>/`; combined plugin+webapp is supported;
   `registerWithRouter` mounts at `/plugins/<id>/`. Verify the exact `public/` mount
   path during impl (low-risk).
6. **Metadata plumbing** — confirmed `yarrboard-client` exposes `hostname`,
   `boardname` (`hostname.split(".")[0]`), `status()` (`IDLE`/`CONNECTING`/
   `CONNECTED`/`RETRYING`/`FAILED`), and `config.name`; `/boards` needs no schema
   `name` field (falls back to `boardname` while offline).

## Test-only risk (not a decision)

- **ESP32 concurrent-connection limit** — the plugin already holds one polling WS;
  each browser adds another. Verify the board tolerates the plugin connection +
  one or more browsers at once. This is the most likely real-world constraint and
  is covered by the testing checklist above.

## Remaining build step (not a decision)

- `http-proxy` is **not yet installed** — add it to `dependencies` and `npm i`.
