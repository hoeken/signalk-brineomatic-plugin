const test = require("node:test");
const assert = require("node:assert/strict");
const { SignalKBus } = require("../src/signalk-bus");
const { createFakeApp } = require("./helpers");

test("SignalKBus", async (t) => {
  await t.test("queueDelta buffers until sendDeltas, then flushes one update", () => {
    const app = createFakeApp();
    const bus = new SignalKBus(app, "test-plugin");

    bus.queueDelta("watermaker.wm.status", "RUNNING");
    bus.queueDelta("watermaker.wm.salinity", 250);
    assert.equal(app.messages.length, 0, "nothing is sent before sendDeltas()");

    bus.sendDeltas();

    assert.equal(app.messages.length, 1);
    assert.equal(app.messages[0].pluginId, "test-plugin");
    assert.deepEqual(app.messages[0].delta, {
      updates: [
        {
          values: [
            { path: "watermaker.wm.status", value: "RUNNING" },
            { path: "watermaker.wm.salinity", value: 250 },
          ],
        },
      ],
    });
  });

  await t.test("queueDelta skips undefined values (SignalK rejects deltas without a value)", () => {
    const app = createFakeApp();
    const bus = new SignalKBus(app, "test-plugin");

    bus.queueDelta("watermaker.wm.board.firmware_version", undefined);
    bus.queueDelta("watermaker.wm.board.name", null);
    bus.queueDelta("watermaker.wm.salinity", 0);
    bus.sendDeltas();

    assert.equal(app.messages.length, 1);
    assert.deepEqual(app.messages[0].delta.updates[0].values, [
      { path: "watermaker.wm.board.name", value: null },
      { path: "watermaker.wm.salinity", value: 0 },
    ]);
    assert.equal(app.debugLogs.length, 1, "the skipped path is logged for debugging");
  });

  await t.test("sendDeltas drains the queue so a second call is a no-op", () => {
    const app = createFakeApp();
    const bus = new SignalKBus(app, "test-plugin");

    bus.queueDelta("a", 1);
    bus.sendDeltas();
    bus.sendDeltas();

    assert.equal(app.messages.length, 1, "empty queue does not call handleMessage");
  });

  await t.test("sendDeltas with an empty queue never calls handleMessage", () => {
    const app = createFakeApp();
    const bus = new SignalKBus(app, "test-plugin");

    bus.sendDeltas();

    assert.equal(app.messages.length, 0);
  });

  await t.test("queueMeta de-duplicates paths within a batch", () => {
    const app = createFakeApp();
    const bus = new SignalKBus(app, "test-plugin");

    bus.queueMeta("watermaker.wm.status", { description: "first" });
    bus.queueMeta("watermaker.wm.status", { description: "second (ignored)" });
    bus.queueMeta("watermaker.wm.salinity", { units: "PPM" });
    bus.sendMetas();

    assert.equal(app.messages.length, 1);
    const metas = app.messages[0].delta.updates[0].meta;
    assert.equal(metas.length, 2);
    assert.deepEqual(metas[0], {
      path: "watermaker.wm.status",
      value: { description: "first" },
    });
    assert.deepEqual(metas[1], {
      path: "watermaker.wm.salinity",
      value: { units: "PPM" },
    });
  });

  await t.test("meta de-duplication persists across sends (paths are remembered)", () => {
    const app = createFakeApp();
    const bus = new SignalKBus(app, "test-plugin");

    bus.queueMeta("watermaker.wm.status", { description: "once" });
    bus.sendMetas();
    assert.equal(app.messages.length, 1);

    // Re-queuing the same path after a flush is ignored: metaPaths is not reset.
    bus.queueMeta("watermaker.wm.status", { description: "again" });
    bus.sendMetas();
    assert.equal(app.messages.length, 1, "no second meta message is emitted");
  });

  await t.test("queueConsolidated queues both a meta and a delta", () => {
    const app = createFakeApp();
    const bus = new SignalKBus(app, "test-plugin");

    bus.queueConsolidated("watermaker.wm.board.uptime", 42, { units: "s" });
    bus.sendUpdates();

    const values = app.messages.flatMap((m) =>
      m.delta.updates.flatMap((u) => u.values || []),
    );
    const metas = app.messages.flatMap((m) =>
      m.delta.updates.flatMap((u) => u.meta || []),
    );
    assert.deepEqual(values, [{ path: "watermaker.wm.board.uptime", value: 42 }]);
    assert.deepEqual(metas, [{ path: "watermaker.wm.board.uptime", value: { units: "s" } }]);
  });

  await t.test("sendUpdates flushes deltas and metas together", () => {
    const app = createFakeApp();
    const bus = new SignalKBus(app, "test-plugin");

    bus.queueDelta("a", 1);
    bus.queueMeta("a", { units: "V" });
    bus.sendUpdates();

    // Two handleMessage calls: one for deltas, one for metas.
    assert.equal(app.messages.length, 2);
    assert.ok(app.messages.some((m) => m.delta.updates[0].values));
    assert.ok(app.messages.some((m) => m.delta.updates[0].meta));
  });
});
