const test = require("node:test");
const assert = require("node:assert/strict");
const createPlugin = require("../src/index");
const { createFakeApp, collectDeltas, collectMetas } = require("./helpers");

// Assert two numbers are equal within a small tolerance (unit conversions go
// through float division/multiplication, so exact equality is fragile).
function close(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `${msg || ""} expected ~${expected}, got ${actual}`,
  );
}

test("plugin metadata and schema", () => {
  const plugin = createPlugin(createFakeApp());

  assert.equal(plugin.id, "signalk-brineomatic-plugin");
  assert.equal(plugin.name, "Brineomatic");
  assert.equal(typeof plugin.start, "function");
  assert.equal(typeof plugin.stop, "function");

  const config = plugin.schema.properties.config;
  assert.equal(config.type, "array");
  const props = config.items.properties;
  assert.equal(props.host.default, "brineomatic.local");
  assert.equal(props.use_ssl.default, false);
  assert.equal(props.update_interval.default, 1000);
  assert.equal(props.require_login.default, false);
  assert.equal(props.enable_proxy.default, false);
  assert.equal(props.proxy_port.default, 3200);
});

test("registerWithRouter serves /boards", async (t) => {
  await t.test("returns [] before the proxies are started", () => {
    const plugin = createPlugin(createFakeApp());
    const routes = {};
    plugin.registerWithRouter({ get: (p, h) => (routes[p] = h) });

    let sent;
    routes["/boards"]({}, { json: (v) => (sent = v) });
    assert.deepEqual(sent, []);
  });

  await t.test("delegates to boardProxies.boards() once started", () => {
    const plugin = createPlugin(createFakeApp());
    plugin.boardProxies = { boards: () => [{ host: "wm.local", proxy_port: 3200 }] };
    const routes = {};
    plugin.registerWithRouter({ get: (p, h) => (routes[p] = h) });

    let sent;
    routes["/boards"]({}, { json: (v) => (sent = v) });
    assert.deepEqual(sent, [{ host: "wm.local", proxy_port: 3200 }]);
  });
});

test("createYarrboard", async (t) => {
  await t.test("derives board name/path and wires the bus", () => {
    const plugin = createPlugin(createFakeApp());
    const yb = plugin.createYarrboard("wm.local", "admin", "admin", false, false, 2000);

    assert.equal(yb.hostname, "wm.local");
    assert.equal(yb.boardname, "wm");
    assert.equal(yb.getMainBoardPath(), "watermaker.wm");
    assert.equal(yb.update_interval, 2000);
    assert.equal(yb.bus, plugin.bus);
  });

  await t.test("onmessage routes status errors and successes to the app", () => {
    const app = createFakeApp();
    const plugin = createPlugin(app);
    const yb = plugin.createYarrboard("wm.local");

    yb.onmessage({ msg: "status", status: "error", message: "overheated" });
    yb.onmessage({ msg: "status", status: "success", message: "all good" });

    assert.deepEqual(app.pluginErrors, ["[wm.local] overheated"]);
    assert.deepEqual(app.statuses, ["[wm.local] all good"]);
  });

  await t.test("onmessage routes config messages into handleConfig", () => {
    const plugin = createPlugin(createFakeApp());
    const yb = plugin.createYarrboard("wm.local");

    yb.onmessage({ msg: "config", firmware_version: "9.9.9" });
    assert.equal(yb.config.firmware_version, "9.9.9");
  });

  await t.test("handleUpdate is ignored until a config has arrived", () => {
    const app = createFakeApp();
    const plugin = createPlugin(app);
    const yb = plugin.createYarrboard("wm.local");

    yb.handleUpdate({ brineomatic: true, salinity: 100 });
    assert.equal(app.messages.length, 0, "no deltas before config");
  });

  await t.test("handleConfig publishes board metadata and config deltas", () => {
    const app = createFakeApp();
    const plugin = createPlugin(app);
    const yb = plugin.createYarrboard("wm.local");

    yb.handleConfig({
      brineomatic: true,
      firmware_version: "1.2.3",
      hardware_version: "rev-a",
      name: "My Watermaker",
      uuid: "abcd-1234",
      use_ssl: false,
      status: "IDLE",
    });

    const deltas = collectDeltas(app);
    const metas = collectMetas(app);

    assert.equal(deltas["watermaker.wm.board.firmware_version"], "1.2.3");
    assert.equal(deltas["watermaker.wm.board.hardware_version"], "rev-a");
    assert.equal(deltas["watermaker.wm.board.name"], "My Watermaker");
    assert.equal(deltas["watermaker.wm.board.uuid"], "abcd-1234");
    assert.equal(deltas["watermaker.wm.board.hostname"], "wm.local");
    assert.equal(deltas["watermaker.wm.status"], "IDLE");

    assert.equal(metas["watermaker.wm.motor_temperature"].units, "K");
    assert.equal(metas["watermaker.wm.flowrate"].units, "m3/s");
    assert.equal(metas["watermaker.wm.membrane_pressure"].units, "Pa");
    assert.ok(metas["watermaker.wm.status"].description);
  });

  await t.test("handleUpdate converts units into SignalK base units", () => {
    const app = createFakeApp();
    const plugin = createPlugin(app);
    const yb = plugin.createYarrboard("wm.local");

    yb.handleConfig({ brineomatic: true }); // sets this.config so updates flow
    app.messages = []; // ignore the config batch; focus on the update

    yb.handleUpdate({
      brineomatic: true,
      status: "RUNNING",
      motor_temperature: 40, // °C -> K
      water_temperature: 25, // °C -> K
      flowrate: 3600000, // mL/h -> m3/s
      product_flowrate: 1800000,
      brine_flowrate: 900000,
      total_flowrate: 3600000,
      volume: 1000, // L(mL?) -> m3 (*0.001)
      flush_volume: 500,
      salinity: 300, // passthrough (PPM)
      filter_pressure: 2, // bar -> Pa (*100000)
      membrane_pressure: 55,
      tank_level: 0.5, // passthrough (ratio)
      boost_pump_on: true,
      high_pressure_pump_on: false,
      cooling_fan_on: true,
      next_flush_countdown: 5000, // ms -> s (round)
      runtime_elapsed: 123456,
      finish_countdown: 60000,
      flush_elapsed: 1500,
      flush_countdown: 2500,
      pickle_elapsed: 1000,
      depickle_countdown: 4000,
    });

    const d = collectDeltas(app);

    close(d["watermaker.wm.motor_temperature"], 313.15, "motor temp");
    close(d["watermaker.wm.water_temperature"], 298.15, "water temp");
    close(d["watermaker.wm.flowrate"], 1, "flowrate");
    close(d["watermaker.wm.product_flowrate"], 0.5, "product flowrate");
    close(d["watermaker.wm.brine_flowrate"], 0.25, "brine flowrate");
    close(d["watermaker.wm.total_flowrate"], 1, "total flowrate");
    close(d["watermaker.wm.volume"], 1, "volume");
    close(d["watermaker.wm.flush_volume"], 0.5, "flush volume");
    close(d["watermaker.wm.filter_pressure"], 200000, "filter pressure");
    close(d["watermaker.wm.membrane_pressure"], 5500000, "membrane pressure");

    assert.equal(d["watermaker.wm.status"], "RUNNING");
    assert.equal(d["watermaker.wm.salinity"], 300);
    assert.equal(d["watermaker.wm.tank_level"], 0.5);
    assert.equal(d["watermaker.wm.boost_pump_on"], true);
    assert.equal(d["watermaker.wm.high_pressure_pump_on"], false);
    assert.equal(d["watermaker.wm.cooling_fan_on"], true);

    assert.equal(d["watermaker.wm.next_flush_countdown"], 5);
    assert.equal(d["watermaker.wm.runtime_elapsed"], 123);
    assert.equal(d["watermaker.wm.finish_countdown"], 60);
    assert.equal(d["watermaker.wm.flush_elapsed"], 2); // round(1.5)
    assert.equal(d["watermaker.wm.flush_countdown"], 3); // round(2.5)
    assert.equal(d["watermaker.wm.pickle_elapsed"], 1);
    assert.equal(d["watermaker.wm.depickle_countdown"], 4);
  });

  await t.test("handleUpdate records optional bus_voltage and uptime", () => {
    const app = createFakeApp();
    const plugin = createPlugin(app);
    const yb = plugin.createYarrboard("wm.local");

    yb.handleConfig({ brineomatic: true });
    app.messages = [];

    yb.handleUpdate({ brineomatic: true, bus_voltage: 13.2, uptime: 5_000_000 });

    const d = collectDeltas(app);
    assert.equal(d["watermaker.wm.board.bus_voltage"], 13.2);
    assert.equal(d["watermaker.wm.board.uptime"], 5); // us -> s (round)
  });

  await t.test("does not emit brineomatic deltas when the payload lacks brineomatic", () => {
    const app = createFakeApp();
    const plugin = createPlugin(app);
    const yb = plugin.createYarrboard("wm.local");

    yb.handleConfig({ brineomatic: true });
    app.messages = [];

    yb.handleUpdate({ salinity: 123 }); // no brineomatic key
    const d = collectDeltas(app);
    assert.equal(d["watermaker.wm.salinity"], undefined);
  });
});

test("plugin start/stop lifecycle", () => {
  const app = createFakeApp();
  const plugin = createPlugin(app);

  // Replace the real connection factory so start() opens no sockets.
  const started = [];
  const closed = [];
  plugin.createYarrboard = (host) => ({
    hostname: host,
    boardname: host.split(".")[0],
    config: { name: `cfg-${host}` },
    start() {
      started.push(host);
    },
    close() {
      closed.push(host);
    },
    status() {
      return "CONNECTED";
    },
  });

  plugin.start({
    config: [
      { host: "wm.local", use_ssl: false, proxy_port: 3200, enable_proxy: false, update_interval: 1000 },
    ],
  });

  assert.deepEqual(started, ["wm.local"]);
  assert.equal(plugin.connections.length, 1);
  assert.ok(plugin.boardProxies, "a BoardProxyManager is created");
  // enable_proxy was false, so no proxy is running.
  assert.deepEqual(plugin.boardProxies.boards(), []);

  plugin.stop();

  assert.deepEqual(closed, ["wm.local"]);
  assert.equal(plugin.connections.length, 0);
  assert.equal(plugin.boardProxies, null);
});

test("start() completes with schema defaults (no config array)", () => {
  const app = createFakeApp();
  const plugin = createPlugin(app);

  // SignalK scores the plugin by starting it with only schema defaults applied.
  // The config array has no default, so options.config is undefined — start()
  // must complete instead of throwing "config is not iterable".
  assert.doesNotThrow(() => plugin.start({}));

  assert.equal(plugin.connections.length, 0);
  assert.ok(plugin.boardProxies, "a BoardProxyManager is still created");
  assert.deepEqual(plugin.boardProxies.boards(), []);

  plugin.stop();
});
