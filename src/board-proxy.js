/*
 * Copyright 2026 Zach Hoeken <hoeken@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// board-proxy.js — reusable SignalK integration helper for exposing an
// ESP32 board's own webapp remotely. SignalK/ESP32-aware but otherwise generic:
// it takes a plain board-descriptor list and knows nothing about
// yarrboard-client, watermaker.* paths, or any specific plugin. Drop it into any
// SignalK plugin alongside reverse-proxy.js and public/, feed it descriptors,
// and register its /boards route.

const { ReverseProxy } = require("./reverse-proxy");

// A descriptor value may be a plain value or a getter function so callers can
// expose live state (name/status change after the board connects).
function resolve(v) {
  return typeof v === "function" ? v() : v;
}

class BoardProxyManager {
  constructor(app) {
    this.app = app;
    this.proxies = [];
  }

  /**
   * Start one reverse proxy per enabled descriptor.
   *
   * @param {Array<object>} descriptors  Board descriptors, each:
   *   { host, use_ssl, proxy_port, enable_proxy, name, status }
   *   - host          board hostname or IP (required)
   *   - use_ssl       connect to the board over https/wss (default false)
   *   - proxy_port    local listen port for this board's proxy (required)
   *   - enable_proxy  opt-in flag — no port opens unless truthy
   *   - name          display name; value or getter (falls back to host)
   *   - status        connection state; value or getter
   */
  start(descriptors) {
    const seen = new Set();
    for (const b of descriptors || []) {
      if (!b.enable_proxy)
        continue;
      if (!b.proxy_port) {
        this.app.error(`no proxy_port set for ${b.host}, skipping proxy`);
        continue;
      }
      if (seen.has(b.proxy_port)) {
        this.app.error(`duplicate proxy_port ${b.proxy_port}, skipping ${b.host}`);
        continue;
      }
      seen.add(b.proxy_port);

      const proxy = new ReverseProxy({
        target: `${b.use_ssl ? "https" : "http"}://${String(b.host).trim()}`,
        port: b.proxy_port,
        onError: (msg) => this.app.setPluginError(`[${b.host}] ${msg}`),
        log: (msg) => this.app.debug(msg),
      });
      proxy.start();
      this.proxies.push({ proxy, descriptor: b });
    }
  }

  stop() {
    for (const p of this.proxies)
      p.proxy.close();
    this.proxies = [];
  }

  // Metadata for the landing page: one entry per running proxy.
  boards() {
    return this.proxies.map(({ descriptor: b }) => ({
      host: b.host,
      name: resolve(b.name) || b.host,
      proxy_port: b.proxy_port,
      state: resolve(b.status),
    }));
  }

  // Mount the /boards metadata route on the plugin's express router. Served at
  // /plugins/<plugin-id>/boards, same origin as the webapp — no CORS needed.
  registerWithRouter(router) {
    router.get("/boards", (req, res) => res.json(this.boards()));
  }
}

module.exports = { BoardProxyManager };
