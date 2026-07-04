// Shared test doubles used across the suite.
//
// createFakeApp() returns a stand-in for the SignalK `app` the plugin is handed
// at startup. It records every call the plugin makes (deltas, debug logs, status
// updates, errors) so tests can assert on them. collectDeltas/collectMetas read
// the recorded handleMessage calls back into a flat { path: value } map.

function createFakeApp() {
  const app = {
    messages: [],
    debugLogs: [],
    errors: [],
    statuses: [],
    pluginErrors: [],
    handleMessage(pluginId, delta) {
      app.messages.push({ pluginId, delta });
    },
    debug(msg) {
      app.debugLogs.push(msg);
    },
    error(msg) {
      app.errors.push(msg);
    },
    setPluginStatus(msg) {
      app.statuses.push(msg);
    },
    setPluginError(msg) {
      app.pluginErrors.push(msg);
    },
  };
  return app;
}

// Flatten every delta value the fake app has received into a { path: value } map.
// Later values win, so the map reflects the most recent value for each path.
function collectDeltas(app) {
  const map = {};
  for (const { delta } of app.messages) {
    for (const update of delta.updates || []) {
      for (const v of update.values || []) {
        map[v.path] = v.value;
      }
    }
  }
  return map;
}

// Same as collectDeltas but for the meta entries.
function collectMetas(app) {
  const map = {};
  for (const { delta } of app.messages) {
    for (const update of delta.updates || []) {
      for (const m of update.meta || []) {
        map[m.path] = m.value;
      }
    }
  }
  return map;
}

module.exports = { createFakeApp, collectDeltas, collectMetas };
