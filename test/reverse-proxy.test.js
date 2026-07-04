const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { server: WebSocketServer, w3cwebsocket: W3CWebSocket } = require("websocket");
const { ReverseProxy } = require("../reverse-proxy");

// Bind a server to an ephemeral port on loopback and resolve with the port.
function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address().port);
    });
  });
}

// Start a ReverseProxy on an ephemeral loopback port and resolve with that port.
function startProxy(opts) {
  const proxy = new ReverseProxy({ bind: "127.0.0.1", port: 0, ...opts });
  const ready = new Promise((resolve, reject) => {
    proxy.start();
    proxy.server.once("listening", () => resolve(proxy.server.address().port));
    proxy.server.once("error", reject);
  });
  return { proxy, ready };
}

// Simple promisified GET that never re-uses a socket (so servers close cleanly).
function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers, agent: false }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        body += c;
      });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
  });
}

// Grab a port number that currently has nothing listening on it.
async function findFreePort() {
  const s = http.createServer();
  const port = await listen(s);
  await new Promise((r) => s.close(r));
  return port;
}

test("ReverseProxy", async (t) => {
  await t.test("forwards an HTTP request to the upstream and returns its response", async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`upstream saw ${req.method} ${req.url}`);
    });
    const upstreamPort = await listen(upstream);

    const { proxy, ready } = startProxy({ target: `http://127.0.0.1:${upstreamPort}` });
    const proxyPort = await ready;

    const res = await httpGet(`http://127.0.0.1:${proxyPort}/status`);
    assert.equal(res.status, 200);
    assert.equal(res.body, "upstream saw GET /status");

    proxy.close();
    await new Promise((r) => upstream.close(r));
  });

  await t.test("strips the cookie header by default before forwarding", async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(req.headers));
    });
    const upstreamPort = await listen(upstream);

    const { proxy, ready } = startProxy({ target: `http://127.0.0.1:${upstreamPort}` });
    const proxyPort = await ready;

    const res = await httpGet(`http://127.0.0.1:${proxyPort}/`, {
      cookie: "session=supersecretlongvalue",
      "x-keep": "yes",
    });
    const received = JSON.parse(res.body);
    assert.equal(received.cookie, undefined, "cookie is removed");
    assert.equal(received["x-keep"], "yes", "other headers pass through");

    proxy.close();
    await new Promise((r) => upstream.close(r));
  });

  await t.test("honours a custom stripRequestHeaders list", async () => {
    const upstream = http.createServer((req, res) => {
      res.writeHead(200);
      res.end(JSON.stringify(req.headers));
    });
    const upstreamPort = await listen(upstream);

    const { proxy, ready } = startProxy({
      target: `http://127.0.0.1:${upstreamPort}`,
      stripRequestHeaders: ["x-secret"],
    });
    const proxyPort = await ready;

    const res = await httpGet(`http://127.0.0.1:${proxyPort}/`, {
      "x-secret": "hush",
      cookie: "kept=now",
    });
    const received = JSON.parse(res.body);
    assert.equal(received["x-secret"], undefined, "custom header is stripped");
    assert.equal(received.cookie, "kept=now", "cookie now passes since it is not in the list");

    proxy.close();
    await new Promise((r) => upstream.close(r));
  });

  await t.test("returns 502 when the upstream is unreachable", async () => {
    const deadPort = await findFreePort();
    const { proxy, ready } = startProxy({ target: `http://127.0.0.1:${deadPort}` });
    const proxyPort = await ready;

    const res = await httpGet(`http://127.0.0.1:${proxyPort}/`);
    assert.equal(res.status, 502);
    assert.match(res.body, /Upstream unreachable/);

    proxy.close();
  });

  await t.test("reports listen failures (EADDRINUSE) via onError instead of crashing", async () => {
    const blocker = http.createServer();
    const port = await listen(blocker);

    const errors = [];
    const proxy = new ReverseProxy({
      target: "http://127.0.0.1:1",
      port,
      bind: "127.0.0.1",
      onError: (msg) => errors.push(msg),
    });

    await new Promise((resolve) => {
      proxy.start();
      // Both our listener and the proxy's internal error handler fire; the
      // internal one runs first and invokes onError.
      proxy.server.once("error", resolve);
    });

    assert.equal(errors.length, 1);
    assert.match(errors[0], new RegExp(`proxy port ${port}`));

    proxy.close();
    await new Promise((r) => blocker.close(r));
  });

  await t.test("close() is a no-op when the proxy was never started", () => {
    const proxy = new ReverseProxy({ target: "http://127.0.0.1:1", port: 0 });
    assert.doesNotThrow(() => proxy.close());
    assert.doesNotThrow(() => proxy.close(), "double close is safe too");
  });

  await t.test("close() stops accepting connections", async () => {
    const upstream = http.createServer((req, res) => res.end("ok"));
    const upstreamPort = await listen(upstream);

    const { proxy, ready } = startProxy({ target: `http://127.0.0.1:${upstreamPort}` });
    const proxyPort = await ready;

    proxy.close();
    // A short beat for the listening socket to release.
    await new Promise((r) => setTimeout(r, 50));

    await assert.rejects(
      httpGet(`http://127.0.0.1:${proxyPort}/`),
      /ECONNREFUSED/,
    );

    await new Promise((r) => upstream.close(r));
  });

  await t.test("proxies a WebSocket connection end to end", { timeout: 5000 }, async () => {
    const httpServer = http.createServer();
    const upstreamPort = await listen(httpServer);
    const wsServer = new WebSocketServer({ httpServer, autoAcceptConnections: true });
    wsServer.on("connect", (conn) => {
      conn.on("message", (msg) => {
        if (msg.type === "utf8")
          conn.sendUTF(`echo:${msg.utf8Data}`);
      });
    });

    const { proxy, ready } = startProxy({ target: `http://127.0.0.1:${upstreamPort}` });
    const proxyPort = await ready;

    const reply = await new Promise((resolve, reject) => {
      const client = new W3CWebSocket(`ws://127.0.0.1:${proxyPort}/ws`);
      client.onopen = () => client.send("ping");
      client.onmessage = (e) => {
        resolve(e.data);
        client.close();
      };
      client.onerror = (err) => reject(err);
    });
    assert.equal(reply, "echo:ping");

    wsServer.shutDown();
    proxy.close();
    await new Promise((r) => httpServer.close(r));
  });
});
