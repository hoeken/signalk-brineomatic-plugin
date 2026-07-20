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

// Publishes watermaker state to the NMEA 2000 bus as PGN 130567 (Watermaker
// Input Setting and Status) by emitting canboat-JSON on the server's
// nmea2000JsonOut event, the same mechanism signalk-to-nmea2000 uses.
//
// Board payloads are partial (an update only carries the fields that exist on
// that firmware), but every N2K transmission must carry the whole PGN, so the
// last known value of each field is cached and the full picture is sent every
// time. Fields the board has never reported stay undefined and canboatjs
// encodes them as "unavailable" on the wire.

// Brineomatic firmware status string -> canboat WATERMAKER_STATE lookup name.
// The N2K enumeration has no pickling concept: pickling/depickling circulate
// fluid through the system so they map to Rinsing, and a pickled (stored)
// watermaker is simply Stopped.
const OPERATING_STATE = {
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

// Board fields cached for the PGN, in the board's native units
// (°C, L/h, bar, PPM, ms).
const CACHED_FIELDS = [
  "status",
  "run_result",
  "water_temperature",
  "flowrate",
  "product_flowrate",
  "brine_flowrate",
  "salinity",
  "product_salinity",
  "filter_pressure",
  "membrane_pressure",
  "diverter_valve_open",
  "boost_pump_on",
  "high_pressure_pump_on",
  "runtime_elapsed",
];

// run_result values that mean the last run ended normally; anything else
// present is an ERR_* code and reports a system warning.
const OK_RESULTS = /^(STARTUP$|SUCCESS|USER_STOP$)/;

// Conversion helpers that pass unknown (undefined) values through untouched,
// so a field the board never sent stays unavailable instead of becoming NaN.
const yesNo = (v) => (v === undefined ? undefined : v ? "Yes" : "No");
const celsiusToKelvin = (v) => (v === undefined ? undefined : v + 273.15);
const barToPascal = (v) => (v === undefined ? undefined : v * 100000);

// The PGN's OK_WARNING indicators default to OK when we have nothing to
// report (no run_result yet, valve state never seen).
const okUnless = (warning) => (warning ? "Warning" : "OK");

class N2KPublisher {
  constructor(app) {
    this.app = app;
    this.state = {};
  }

  // Merge a brineomatic update/config payload into the cache and publish.
  handleData(data) {
    if (!data.brineomatic)
      return;

    for (const field of CACHED_FIELDS)
      if (Object.hasOwn(data, field))
        this.state[field] = data[field];

    this.publish();
  }

  publish() {
    const s = this.state;
    const state = s.status === undefined ? undefined : OPERATING_STATE[s.status];
    const result = s.run_result;

    // Field keys are the canboat camelCase ids for PGN 130567. The board
    // reports source water temperature; it goes in the PGN's only temperature
    // field. There is no dedicated high-pressure warning field, so membrane
    // pressure errors are reported through Sensor Status. Pressures the board
    // doesn't measure (pre-filter, feed) report 0.
    this.app.emit("nmea2000JsonOut", {
      pgn: 130567,
      watermakerOperatingState: state,
      productionStartStop: yesNo(s.status === undefined ? undefined : s.status === "RUNNING"),
      rinseStartStop: yesNo(s.status === undefined ? undefined : s.status === "FLUSHING"),
      flushModeStatus: yesNo(s.status === undefined ? undefined : s.status === "FLUSHING"),
      lowPressurePumpStatus: yesNo(s.boost_pump_on),
      highPressurePumpStatus: yesNo(s.high_pressure_pump_on),
      // Open means product is being diverted overboard (see
      // ERR_DIVERTER_VALVE_OPEN), so open reports a warning.
      productSolenoidValveStatus: okUnless(s.diverter_valve_open),
      salinityStatus: okUnless(result && result.startsWith("ERR_PRODUCT_SALINITY")),
      sensorStatus: okUnless(result && result.startsWith("ERR_MEMBRANE_PRESSURE")),
      oilChangeIndicatorStatus: "OK",
      // ERR_FLUSH_FILTER_PRESSURE_LOW is intentionally not matched here.
      filterStatus: okUnless(result && result.startsWith("ERR_FILTER_PRESSURE")),
      systemStatus: okUnless(result && !OK_RESULTS.test(result)),
      salinity: s.product_salinity ?? s.salinity, // PPM, same as the PGN
      productWaterTemperature: celsiusToKelvin(s.water_temperature),
      preFilterPressure: 0,
      postFilterPressure: barToPascal(s.filter_pressure),
      feedPressure: 0,
      systemHighPressure: barToPascal(s.membrane_pressure),
      productWaterFlow: s.product_flowrate ?? s.flowrate, // L/h, same as the PGN
      brineWaterFlow: s.brine_flowrate, // L/h
      runTime: Math.round((s.runtime_elapsed ?? 0) / 1000), // ms -> s
    });
  }
}

module.exports = { N2KPublisher };
