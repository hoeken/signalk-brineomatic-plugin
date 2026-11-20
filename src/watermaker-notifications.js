const operationFields = ["run_result", "flush_result", "pickle_result", "depickle_result"];

// Names match BOM_RESULT_LIST in the Brineomatic firmware.
const faultMessages = {
  ERR_BATTERY_LEVEL: "Battery level below the configured minimum",
  ERR_FILTER_PRESSURE_TIMEOUT: "Filter pressure did not stabilize before timeout",
  ERR_FILTER_PRESSURE_LOW: "Filter pressure too low",
  ERR_FILTER_PRESSURE_HIGH: "Filter pressure too high",
  ERR_MEMBRANE_PRESSURE_TIMEOUT: "Membrane pressure did not stabilize before timeout",
  ERR_MEMBRANE_PRESSURE_LOW: "Membrane pressure too low",
  ERR_MEMBRANE_PRESSURE_HIGH: "Membrane pressure too high",
  ERR_PRODUCT_FLOWRATE_TIMEOUT: "Product flow did not stabilize before timeout",
  ERR_PRODUCT_FLOWRATE_LOW: "Product flow too low",
  ERR_PRODUCT_FLOWRATE_HIGH: "Product flow too high",
  ERR_FLUSH_FLOWRATE_LOW: "Flush flow too low",
  ERR_FLUSH_FILTER_PRESSURE_LOW: "Filter pressure too low during flushing",
  ERR_FLUSH_VALVE_ON: "Flush valve remained open after shutdown",
  ERR_FLUSH_TANK_LEVEL_LOW: "Fresh water tank level too low for flushing",
  ERR_FLUSH_TIMEOUT: "Flush exceeded its time limit",
  ERR_BRINE_FLOWRATE_LOW: "Brine flow too low",
  ERR_TOTAL_FLOWRATE_LOW: "Total flow too low",
  ERR_DIVERTER_VALVE_OPEN: "Diverter valve remained open",
  ERR_PRODUCT_SALINITY_TIMEOUT: "Product salinity did not stabilize before timeout",
  ERR_PRODUCT_SALINITY_HIGH: "Product salinity too high",
  ERR_PRODUCTION_TIMEOUT: "Water production exceeded its time limit",
  ERR_MOTOR_TEMPERATURE_HIGH: "Motor temperature too high",
};

function activeFaults(results) {
  return new Set([...results.values()].filter(Boolean));
}

module.exports = function publishResults(app, bus, boardPath, data, boards) {
  const namespace = `notifications.${boardPath}`;
  const results = boards.get(boardPath) ?? new Map();
  const before = activeFaults(results);
  let receivedResult = false;

  for (const field of operationFields) {
    if (!Object.hasOwn(data, field))
      continue;
    const result = data[field];
    bus.queueDelta(`${boardPath}.${field}`, result);

    if (typeof result !== "string" || !result.trim())
      continue;
    receivedResult = true;
    const legacyPath = `${namespace}.${field}`;
    if (!results.has(field) && app.getSelfPath(legacyPath)?.value)
      bus.queueDelta(legacyPath, null);

    if (/^ERR_[A-Z0-9_]+$/.test(result))
      results.set(field, result);
    else if (!results.has(field) || result === "SUCCESS" || result.startsWith("SUCCESS_"))
      results.set(field, null);
  }

  if (!receivedResult)
    return;
  boards.set(boardPath, results);
  const after = activeFaults(results);

  for (const code of before) {
    if (!after.has(code))
      bus.queueDelta(`${namespace}.${code}`, null);
  }

  const board = boardPath.slice("watermaker.".length);
  for (const code of after) {
    if (before.has(code))
      continue;
    const description = faultMessages[code] ?? "Watermaker firmware fault";
    bus.queueDelta(`${namespace}.${code}`, {
      state: "alarm",
      method: ["visual", "sound"],
      message: `Brineomatic (${board}): ${description} [${code}]`,
    });
  }
};
