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
   * @param {string[]} [opts.stripRequestHeaders]  Request headers to delete before
   *   forwarding (HTTP + WS upgrade). Default ["cookie"]: cookies are scoped to a
   *   hostname, not a port, so a big session cookie set on this host (e.g. by
   *   SignalK on :80) rides along to the proxy port too. An embedded upstream
   *   (ESP32) has a tiny header buffer and answers 431 Request Header Fields Too
   *   Large — breaking both the page load and the WebSocket upgrade. It never
   *   needs the cookie, so drop it.
   * @param {number}  [opts.maxHeaderSize]  Max request header bytes the proxy will
   *   parse (default 64 KiB). Raised above Node's 16 KiB default so an oversized
   *   cookie is received and stripped rather than rejected with 431 before we can.
   * @param {(msg: string) => void} [opts.onError]  Called on listen/proxy errors (e.g. EADDRINUSE).
   * @param {(msg: string) => void} [opts.log]      Optional debug logger.
   */
  constructor(opts) {
    this.opts = opts;
    this.server = null;
    this.proxy = null;
  }

  start() {
    const {
      target, port, bind = "0.0.0.0", secure = false, onError, log,
      stripRequestHeaders = ["cookie"],
      maxHeaderSize = 64 * 1024,
    } = this.opts;
    if (log)
      log(`starting proxy on ${bind}:${port} -> ${target}`);

    // Delete these headers from every proxied request (HTTP and WS upgrade alike)
    // before it reaches the upstream — see stripRequestHeaders docs above.
    const strip = stripRequestHeaders.map((h) => h.toLowerCase());
    const stripHeaders = (req) => {
      for (const h of strip)
        delete req.headers[h];
    };

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

    this.server = http.createServer({ maxHeaderSize }, (req, res) => {
      stripHeaders(req);
      this.proxy.web(req, res);
    });
    this.server.on("upgrade", (req, socket, head) => {
      stripHeaders(req);
      this.proxy.ws(req, socket, head);
    });
    this.server.on("error", (err) => {
      // e.g. EADDRINUSE — surface via callback, never crash the host process.
      if (onError)
        onError(`proxy port ${port}: ${err.message}`);
    });
    this.server.listen(port, bind);
  }

  close() {
    try {
      if (this.server)
        this.server.close();
    } catch {
      /* ignore */
    }
    try {
      if (this.proxy)
        this.proxy.close();
    } catch {
      /* ignore */
    }
    this.server = null;
    this.proxy = null;
  }
}

module.exports = { ReverseProxy };
