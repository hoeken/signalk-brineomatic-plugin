const test = require("node:test");
const assert = require("node:assert/strict");
const { N2KPublisher } = require("../src/n2k-publisher");
const { createFakeApp } = require("./helpers");

// Convenience: the fields of the most recently emitted PGN.
function lastPgn(app) {
  assert.ok(app.emitted.length, "expected at least one emitted PGN");
  const { event, msg } = app.emitted[app.emitted.length - 1];
  assert.equal(event, "nmea2000JsonOut");
  return msg;
}

test("N2KPublisher", async (t) => {
  await t.test("publishes PGN 130567 with converted values on update", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({
      brineomatic: true,
      status: "RUNNING",
      water_temperature: 25, // °C -> K
      product_flowrate: 60, // L/h passthrough
      brine_flowrate: 540,
      product_salinity: 220, // PPM passthrough
      filter_pressure: 2, // bar -> Pa
      membrane_pressure: 55,
      diverter_valve_open: false,
      boost_pump_on: true,
      high_pressure_pump_on: false,
      runtime_elapsed: 123456, // ms -> s (round)
    });

    assert.equal(app.emitted.length, 1);
    const pgn = lastPgn(app);

    assert.equal(pgn.pgn, 130567);
    assert.equal(pgn.watermakerOperatingState, "Running");
    assert.equal(pgn.productionStartStop, "Yes");
    assert.equal(pgn.rinseStartStop, "No");
    assert.equal(pgn.flushModeStatus, "No");
    assert.equal(pgn.lowPressurePumpStatus, "Yes");
    assert.equal(pgn.highPressurePumpStatus, "No");
    assert.equal(pgn.productSolenoidValveStatus, "OK");
    assert.equal(pgn.salinity, 220);
    assert.equal(pgn.productWaterTemperature, 298.15);
    assert.equal(pgn.preFilterPressure, 0); // not measured by the board
    assert.equal(pgn.postFilterPressure, 200000);
    assert.equal(pgn.feedPressure, 0); // not measured by the board
    assert.equal(pgn.systemHighPressure, 5500000);
    assert.equal(pgn.productWaterFlow, 60);
    assert.equal(pgn.brineWaterFlow, 540);
    assert.equal(pgn.runTime, 123);
  });

  await t.test("maps every firmware status to a WATERMAKER_STATE value", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    const expected = {
      STARTUP: "Initiating",
      IDLE: "Stopped",
      MANUAL: "Manual",
      RUNNING: "Running",
      STOPPING: "Stopping",
      FLUSHING: "Flushing",
      PICKLING: "Rinsing",
      DEPICKLING: "Rinsing",
      PICKLED: "Stopped",
    };

    for (const [status, state] of Object.entries(expected)) {
      pub.handleData({ brineomatic: true, status });
      assert.equal(lastPgn(app).watermakerOperatingState, state, status);
    }
  });

  await t.test("only FLUSHING reports flush mode / rinse active", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({ brineomatic: true, status: "FLUSHING" });
    assert.equal(lastPgn(app).flushModeStatus, "Yes");
    assert.equal(lastPgn(app).rinseStartStop, "Yes");
    assert.equal(lastPgn(app).productionStartStop, "No");

    pub.handleData({ brineomatic: true, status: "IDLE" });
    assert.equal(lastPgn(app).flushModeStatus, "No");
    assert.equal(lastPgn(app).rinseStartStop, "No");
  });

  await t.test("fields never reported get their defaults (unavailable, OK, or 0)", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({ brineomatic: true, salinity: 150 });
    const pgn = lastPgn(app);

    assert.equal(pgn.salinity, 150);
    // no source data yet -> unavailable on the wire
    assert.equal(pgn.watermakerOperatingState, undefined);
    assert.equal(pgn.productionStartStop, undefined);
    assert.equal(pgn.lowPressurePumpStatus, undefined);
    assert.equal(pgn.productWaterTemperature, undefined);
    assert.equal(pgn.postFilterPressure, undefined);
    assert.equal(pgn.systemHighPressure, undefined);
    // indicators default to OK, unmeasured pressures and runtime to 0
    assert.equal(pgn.productSolenoidValveStatus, "OK");
    assert.equal(pgn.salinityStatus, "OK");
    assert.equal(pgn.sensorStatus, "OK");
    assert.equal(pgn.oilChangeIndicatorStatus, "OK");
    assert.equal(pgn.filterStatus, "OK");
    assert.equal(pgn.systemStatus, "OK");
    assert.equal(pgn.preFilterPressure, 0);
    assert.equal(pgn.feedPressure, 0);
    assert.equal(pgn.runTime, 0);
  });

  await t.test("derives the warning indicators from run_result", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    const expectations = [
      // [run_result, filter, sensor (membrane), salinity, system]
      ["STARTUP", "OK", "OK", "OK", "OK"],
      ["SUCCESS", "OK", "OK", "OK", "OK"],
      ["SUCCESS_TANK_LEVEL", "OK", "OK", "OK", "OK"],
      ["USER_STOP", "OK", "OK", "OK", "OK"],
      ["ERR_FILTER_PRESSURE_LOW", "Warning", "OK", "OK", "Warning"],
      ["ERR_FILTER_PRESSURE_TIMEOUT", "Warning", "OK", "OK", "Warning"],
      ["ERR_MEMBRANE_PRESSURE_HIGH", "OK", "Warning", "OK", "Warning"],
      ["ERR_PRODUCT_SALINITY_HIGH", "OK", "OK", "Warning", "Warning"],
      // flush filter errors are not filter pressure errors
      ["ERR_FLUSH_FILTER_PRESSURE_LOW", "OK", "OK", "OK", "Warning"],
      ["ERR_MOTOR_TEMPERATURE_HIGH", "OK", "OK", "OK", "Warning"],
    ];

    for (const [result, filter, sensor, salinity, system] of expectations) {
      pub.handleData({ brineomatic: true, run_result: result });
      const pgn = lastPgn(app);
      assert.equal(pgn.filterStatus, filter, `${result} filterStatus`);
      assert.equal(pgn.sensorStatus, sensor, `${result} sensorStatus`);
      assert.equal(pgn.salinityStatus, salinity, `${result} salinityStatus`);
      assert.equal(pgn.systemStatus, system, `${result} systemStatus`);
    }
  });

  await t.test("an open diverter valve reports a product solenoid valve warning", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({ brineomatic: true, diverter_valve_open: true });
    assert.equal(lastPgn(app).productSolenoidValveStatus, "Warning");

    pub.handleData({ brineomatic: true, diverter_valve_open: false });
    assert.equal(lastPgn(app).productSolenoidValveStatus, "OK");
  });

  await t.test("caches the latest values so partial updates still publish the full PGN", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({ brineomatic: true, status: "RUNNING", product_salinity: 220 });
    pub.handleData({ brineomatic: true, water_temperature: 20 });

    const pgn = lastPgn(app);
    assert.equal(pgn.watermakerOperatingState, "Running");
    assert.equal(pgn.salinity, 220);
    assert.equal(pgn.productWaterTemperature, 293.15);
  });

  await t.test("prefers the newer product_* field names over the legacy ones", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({
      brineomatic: true,
      flowrate: 50,
      product_flowrate: 60,
      salinity: 300,
      product_salinity: 220,
    });

    const pgn = lastPgn(app);
    assert.equal(pgn.productWaterFlow, 60);
    assert.equal(pgn.salinity, 220);
  });

  await t.test("falls back to the legacy flowrate/salinity field names", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({ brineomatic: true, flowrate: 50, salinity: 300 });

    const pgn = lastPgn(app);
    assert.equal(pgn.productWaterFlow, 50);
    assert.equal(pgn.salinity, 300);
  });

  await t.test("ignores payloads without the brineomatic key", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({ salinity: 150 });

    assert.equal(app.emitted.length, 0);
  });

  await t.test("runTime reports the current cycle's runtime_elapsed in seconds", () => {
    const app = createFakeApp();
    const pub = new N2KPublisher(app);

    pub.handleData({ brineomatic: true, runtime_elapsed: 3600000 });
    assert.equal(lastPgn(app).runTime, 3600);

    // never reported -> 0, not unavailable
    const pub2 = new N2KPublisher(app);
    pub2.handleData({ brineomatic: true, status: "IDLE" });
    assert.equal(lastPgn(app).runTime, 0);
  });
});
