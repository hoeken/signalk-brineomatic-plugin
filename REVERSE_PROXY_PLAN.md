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
- **Reusable across SignalK plugins.** This proxy system is intended to be
  re-used in **other SignalK plugins** that need to expose an **ESP32 board's
  own webapp** remotely (same problem: the board can't run Tailscale). It is
  therefore written to be **SignalK- and ESP32-aware but Brineomatic-agnostic** —
  **no** coupling to `yarrboard-client`, `watermaker.*`, or this plugin's other
  modules. The only things a consuming plugin should have to supply are its own
  board list, its own connection-status getter, and its own branding/copy. See
  **Reusability & module boundary** below.

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

## Reusability & module boundary

The reuse target is **another SignalK plugin that proxies to an ESP32 board's
webapp**. So the system is split into three layers — the first two are the
reusable, Brineomatic-agnostic parts a consuming plugin lifts in; the third is
this plugin's specific wiring.

- **Layer 1 — pure proxy core (`reverse-proxy.js`), maximally self-contained:**
  - Only external dependency is `http-proxy`; only Node built-in is `http`. No
    imports from `index.js`, `signalk-bus.js`, `yarrboard-client`, or SignalK.
  - Exports a `ReverseProxy` class that proxies HTTP **and** WebSocket traffic
    from one local port to one upstream origin, with a `start()`/`close()`
    lifecycle. Takes a plain options object; reports via injected `onError`/`log`
    callbacks rather than reaching back into the host.
  - Fully generic terms (`target`, `port`, "upstream") — nothing reads as
    watermaker- or SignalK-specific.

- **Layer 2 — SignalK integration helper (Brineomatic-agnostic):** the part that
  makes it a *drop-in for SignalK plugins*. Manages N `ReverseProxy` instances
  for a plugin, registers the `/boards` metadata route, and serves the discovery/
  landing `public/`. It is **decoupled from `yarrboard-client`**: the consuming
  plugin passes in a board descriptor list — `{ host, use_ssl, proxy_port,
  enable_proxy, name, status() }` — and this layer needs nothing else. (Consider
  factoring this into its own module, e.g. `signalk-board-proxy.js`, or even a
  standalone npm package, so sibling plugins can `require` it instead of copying.)

- **Layer 3 — this plugin's wiring (Brineomatic-specific, stays here):**
  - `index.js` — the plugin schema, and building the board descriptors above from
    each `YarrboardClient` (`hostname`, `config.name`, `status()`, `use_ssl`),
    plus wiring `onError` → `app.setPluginError`.
  - `public/` copy, icon, and branding. The landing page **markup/logic is
    reusable** (Layer 2); only the text/icon/title here are Brineomatic-specific.

**Reuse checklist (in another SignalK plugin):** copy `reverse-proxy.js` (Layer 1)
and the Layer 2 helper + `public/`, add the `http-proxy` dependency, then feed the
helper your own board list and status getter and swap the landing-page branding.
Nothing from `yarrboard-client`, `signalk-bus.js`, or `watermaker.*` is required.

## Files to create / modify

| File | Change |
| --- | --- |
| `reverse-proxy.js` (new) | **Layer 1 — pure proxy core.** Server lifecycle, no SignalK/Brineomatic coupling (see Reusability & module boundary). |
| `signalk-board-proxy.js` (new) | **Layer 2 — reusable SignalK helper.** Manages N proxies, the `/boards` route, and serving `public/`; consumes a plain board-descriptor list, Brineomatic-agnostic. |
| `index.js` | **Layer 3 (this plugin).** Schema fields; build board descriptors from `YarrboardClient`s; hand them to the Layer 2 helper in start/stop. |
| `public/index.html` (new) | Landing page shell (reusable markup; Brineomatic title/branding). |
| `public/app.js` (new) | Fetch `/boards`, redirect (single) or render grid (multiple) — reusable as-is. |
| `public/style.css` (new) | Grid/card styling (reusable). |
| `public/icon.svg` (new) | Watermaker icon — the one clearly project-specific asset (also satisfies the "add icon" TODO). |
| `package.json` | Add `http-proxy` dependency; add `signalk-webapp` keyword. |
| `README.md` | Document proxy config + Tailscale remote-access usage. |
| `CHANGELOG.md` / `TODO` | Note feature; check off items on completion. |

## Implementation steps

### 1. Dependency + module (`reverse-proxy.js`)

Add `http-proxy` (lighter than `http-proxy-middleware`, gives direct control of
the `upgrade` event; WS-upgrade handling in a SignalK plugin is confirmed
workable).

The core is **self-contained**: it takes a plain options object, derives nothing
from any project type, and reports errors/logs through injected callbacks instead
of touching the host (`app.setPluginError`). Host-specific concerns — building the
`target` from `board.host`/`use_ssl`, choosing the port, formatting error
messages — stay in `index.js` (step 3).

```js
// reverse-proxy.js — project-agnostic HTTP + WebSocket transparent reverse
// proxy. No SignalK / yarrboard-client / Brineomatic dependencies; copy this
// file into any Node project unchanged. Only deps: http (built-in), http-proxy.

const http = require("http");
const httpProxy = require("http-proxy");

class ReverseProxy {
  /**
   * @param {object} opts
   * @param {string}  opts.target     Upstream origin to proxy to, e.g. "http://192.168.1.50".
   * @param {number}  opts.port       Local port to listen on.
   * @param {string}  [opts.bind]     Bind address (default "0.0.0.0").
   * @param {boolean} [opts.secure]   Verify upstream TLS cert (default false — self-signed OK).
   * @param {(msg: string) => void} [opts.onError]  Called on listen/proxy errors (e.g. EADDRINUSE).
   * @param {(msg: string) => void} [opts.log]      Optional debug logger.
   */
  constructor(opts) {
    this.opts = opts;
    this.server = null;
    this.proxy = null;
  }

  start() {
    const { target, port, bind = "0.0.0.0", secure = false, onError, log } = this.opts;
    if (log) log(`starting proxy on ${bind}:${port} -> ${target}`);

    this.proxy = httpProxy.createProxyServer({
      target,
      ws: true,
      changeOrigin: true,
      secure,
    });
    this.proxy.on("error", (err, req, res) => {
      if (res && res.writeHead && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end(`Upstream unreachable: ${err.message}`);
      } else if (res && res.destroy) {
        res.destroy(); // socket (ws upgrade path)
      }
    });

    this.server = http.createServer((req, res) => this.proxy.web(req, res));
    this.server.on("upgrade", (req, socket, head) => this.proxy.ws(req, socket, head));
    this.server.on("error", (err) => {
      // e.g. EADDRINUSE — surface via callback, never crash the host process.
      if (onError) onError(`proxy port ${port}: ${err.message}`);
    });
    this.server.listen(port, bind);
  }

  close() {
    try { this.server && this.server.close(); } catch (e) { /* ignore */ }
    try { this.proxy && this.proxy.close(); } catch (e) { /* ignore */ }
    this.server = null;
    this.proxy = null;
  }
}

module.exports = { ReverseProxy };
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

### 3. Lifecycle via the Layer 2 helper (`signalk-board-proxy.js`)

The lifecycle and the `/boards` endpoint live in the **reusable** Layer 2 helper,
so a consuming plugin gets them for free. The helper is fed a **board-descriptor
list** and a `status()` getter — it never touches `yarrboard-client`:

```js
// signalk-board-proxy.js — reusable SignalK helper (Brineomatic-agnostic)
const { ReverseProxy } = require("./reverse-proxy");

class BoardProxyManager {
  constructor(app) { this.app = app; this.proxies = []; }

  // descriptors: [{ host, use_ssl, proxy_port, enable_proxy, name, status }]
  start(descriptors) {
    const seen = new Set();
    for (const b of descriptors) {
      if (!b.enable_proxy) continue;
      if (seen.has(b.proxy_port)) { this.app.error(`duplicate proxy_port ${b.proxy_port}, skipping ${b.host}`); continue; }
      seen.add(b.proxy_port);
      const proxy = new ReverseProxy({
        target: `${b.use_ssl ? "https" : "http"}://${b.host.trim()}`,
        port: b.proxy_port,
        onError: (msg) => this.app.setPluginError(`[${b.host}] ${msg}`),
        log: (msg) => this.app.debug(msg),
      });
      proxy.start();
      this.proxies.push({ proxy, descriptor: b });
    }
  }

  stop() { for (const p of this.proxies) p.proxy.close(); this.proxies = []; }

  // registerWithRouter delegate — see step 4
  boards() {
    return this.proxies.map(({ descriptor: b }) => ({
      host: b.host, name: b.name || b.host, proxy_port: b.proxy_port, state: b.status(),
    }));
  }
}

module.exports = { BoardProxyManager };
```

`index.js` (Layer 3) only builds the descriptors from its `YarrboardClient`s and
drives the manager:

- `start()`: build `descriptors` (`host`, `use_ssl`, `proxy_port`, `enable_proxy`,
  `name` from `config.name`, `status: () => yb.status()`), then
  `plugin.boardProxies = new BoardProxyManager(app); plugin.boardProxies.start(descriptors)`.
- `stop()`: `plugin.boardProxies && plugin.boardProxies.stop()`.

### 4. Metadata endpoint (`plugin.registerWithRouter`)

Also owned by the Layer 2 helper — `index.js` just delegates:

```js
plugin.registerWithRouter = function (router) {
  router.get("/boards", (req, res) => res.json(plugin.boardProxies.boards()));
};
```

Served at `/plugins/signalk-brineomatic-plugin/boards`, **same origin** as the
webapp → no CORS needed. A consuming plugin gets the identical route at its own
plugin id with no changes.

### 5. Landing webapp (`public/`)

- `package.json`: add `"signalk-webapp"` to `keywords` so the SignalK admin lists
  it. Confirm during impl how the combined plugin+webapp `public/` dir is served
  and at what URL (SignalK webapp convention).
- `app.js` logic:
  1. `fetch('/plugins/signalk-brineomatic-plugin/boards')`. **For reuse:** keep
     the plugin id in a single `const PLUGIN_ID = 'signalk-brineomatic-plugin'` at
     the top of `app.js` — the one string a consuming plugin edits here.
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
7. **Reusability boundary** — the true reuse target is **other SignalK plugins
   proxying to ESP32-board webapps**. The pure proxy core (`reverse-proxy.js`) is
   project-agnostic; the SignalK integration helper is SignalK/ESP32-aware but
   **Brineomatic-agnostic** — decoupled from `yarrboard-client` by taking a plain
   board-descriptor list + `status()` getter. Only this plugin's schema wiring and
   landing-page branding stay Brineomatic-specific. See Reusability & module
   boundary.

## Test-only risk (not a decision)

- **ESP32 concurrent-connection limit** — the plugin already holds one polling WS;
  each browser adds another. Verify the board tolerates the plugin connection +
  one or more browsers at once. This is the most likely real-world constraint and
  is covered by the testing checklist above.

## Remaining build step (not a decision)

- `http-proxy` is **not yet installed** — add it to `dependencies` and `npm i`.
