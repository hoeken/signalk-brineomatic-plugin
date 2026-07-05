const test = require("node:test");
const assert = require("node:assert/strict");
const { createFakeApp } = require("./helpers");

// Replace ReverseProxy with a lightweight fake BEFORE loading the module under
// test, so start() never opens a real TCP port. node --test runs each test file
// in its own process, so this require.cache surgery cannot leak into other files.
const reverseProxyPath = require.resolve("../src/reverse-proxy");
const created = [];
class FakeReverseProxy {
  constructor(opts) {
    this.opts = opts;
    this.started = false;
    this.closed = false;
    created.push(this);
  }

  start() {
    this.started = true;
  }

  close() {
    this.closed = true;
  }
}
require.cache[reverseProxyPath] = {
  id: reverseProxyPath,
  filename: reverseProxyPath,
  loaded: true,
  exports: { ReverseProxy: FakeReverseProxy },
};

const { BoardProxyManager } = require("../src/board-proxy");

test("BoardProxyManager", async (t) => {
  await t.test("only starts proxies for enabled descriptors with a unique port", () => {
    created.length = 0;
    const app = createFakeApp();
    const mgr = new BoardProxyManager(app);

    mgr.start([
      { host: " wm1.local ", use_ssl: false, proxy_port: 3200, enable_proxy: true },
      { host: "wm2.local", use_ssl: true, proxy_port: 3201, enable_proxy: true },
      { host: "wm3.local", proxy_port: 3202, enable_proxy: false }, // disabled → skip
      { host: "wm4.local", enable_proxy: true }, // no port → error + skip
      { host: "wm5.local", proxy_port: 3200, enable_proxy: true }, // dup port → error + skip
    ]);

    assert.equal(created.length, 2, "only the two valid, enabled boards start");
    assert.ok(created.every((p) => p.started));

    assert.equal(created[0].opts.target, "http://wm1.local", "host is trimmed, http for non-ssl");
    assert.equal(created[0].opts.port, 3200);
    assert.equal(created[1].opts.target, "https://wm2.local", "https when use_ssl is set");

    assert.equal(app.errors.length, 2, "missing-port and duplicate-port both logged");
    assert.match(app.errors[0], /no proxy_port set for wm4\.local/);
    assert.match(app.errors[1], /duplicate proxy_port 3200/);

    mgr.stop();
  });

  await t.test("wires onError and log callbacks through to the app", () => {
    created.length = 0;
    const app = createFakeApp();
    const mgr = new BoardProxyManager(app);
    mgr.start([{ host: "wm1.local", proxy_port: 3200, enable_proxy: true }]);

    created[0].opts.onError("boom");
    created[0].opts.log("chatter");

    assert.equal(app.pluginErrors.length, 1);
    assert.match(app.pluginErrors[0], /\[wm1\.local\] boom/);
    assert.deepEqual(app.debugLogs, ["chatter"]);

    mgr.stop();
  });

  await t.test("boards() resolves value-or-getter name/status and falls back to host", () => {
    created.length = 0;
    const app = createFakeApp();
    const mgr = new BoardProxyManager(app);

    mgr.start([
      { host: "wm1.local", proxy_port: 3200, enable_proxy: true, name: () => "Live Name", status: () => "RETRYING" },
      { host: "wm2.local", proxy_port: 3201, enable_proxy: true, name: "Static", status: "CONNECTED" },
      { host: "wm3.local", proxy_port: 3202, enable_proxy: true }, // no name → falls back to host
    ]);

    assert.deepEqual(mgr.boards(), [
      { host: "wm1.local", name: "Live Name", proxy_port: 3200, state: "RETRYING" },
      { host: "wm2.local", name: "Static", proxy_port: 3201, state: "CONNECTED" },
      { host: "wm3.local", name: "wm3.local", proxy_port: 3202, state: undefined },
    ]);

    mgr.stop();
  });

  await t.test("stop() closes every proxy and clears the board list", () => {
    created.length = 0;
    const app = createFakeApp();
    const mgr = new BoardProxyManager(app);
    mgr.start([{ host: "wm1.local", proxy_port: 3200, enable_proxy: true }]);

    const proxy = created[0];
    mgr.stop();

    assert.ok(proxy.closed);
    assert.deepEqual(mgr.boards(), []);
  });

  await t.test("start() tolerates undefined and empty descriptor lists", () => {
    created.length = 0;
    const app = createFakeApp();
    const mgr = new BoardProxyManager(app);

    assert.doesNotThrow(() => mgr.start(undefined));
    assert.doesNotThrow(() => mgr.start([]));
    assert.equal(created.length, 0);
    assert.deepEqual(mgr.boards(), []);
  });

  await t.test("registerWithRouter mounts a /boards route returning boards()", () => {
    created.length = 0;
    const app = createFakeApp();
    const mgr = new BoardProxyManager(app);
    mgr.start([{ host: "wm1.local", proxy_port: 3200, enable_proxy: true, name: "One" }]);

    const routes = {};
    mgr.registerWithRouter({
      get(path, handler) {
        routes[path] = handler;
      },
    });

    assert.equal(typeof routes["/boards"], "function");
    let sent;
    routes["/boards"]({}, { json: (v) => (sent = v) });
    assert.deepEqual(sent, mgr.boards());

    mgr.stop();
  });
});
