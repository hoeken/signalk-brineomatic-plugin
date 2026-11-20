const actions = {
  start: ["IDLE"],
  stop: ["RUNNING", "FLUSHING", "PICKLING", "DEPICKLING"],
  flush: ["IDLE", "PICKLED"],
};

const fields = [
  "status", "run_result", "flush_result", "runtime_elapsed", "finish_countdown",
  "next_flush_countdown", "flush_elapsed", "flush_countdown", "boost_pump_on",
  "high_pressure_pump_on", "diverter_valve_open", "flush_valve_open", "cooling_fan_on",
  "filter_pressure", "membrane_pressure", "product_salinity", "salinity",
  "product_flowrate", "flowrate", "brine_salinity", "brine_flowrate", "total_flowrate",
  "water_temperature", "motor_temperature", "volume", "flush_volume", "tank_level",
];

const completed = (statusCode, message) => ({ state: "COMPLETED", statusCode, message });
const switchPath = (path, action) => `${path}.controls.${action}.state`;

module.exports = function createControls(app, plugin) {
  const registered = new Set();

  function current(board) {
    const entry = board.controlUpdate;
    return board.isOpen() && entry?.socket === board.ws &&
      Date.now() - entry.timestamp < Math.max(5000, board.update_interval * 3)
      ? entry.data : null;
  }

  function available(board, action) {
    const update = current(board);
    return Boolean(update && !board.pendingControl && actions[action].includes(update.status));
  }

  function execute(board, action, callback) {
    if (!board || !current(board))
      return completed(503, "Waiting for live watermaker status.");
    if (!available(board, action))
      return completed(409, "This action is unavailable in the current watermaker state.");

    const socket = board.ws;
    const msgid = board.nextMessageId++;
    const finish = (result) => {
      if (board.pendingControl?.msgid !== msgid)
        return;
      clearTimeout(timer);
      socket.removeListener("close", closed);
      board.pendingControl = null;
      // Require another status update before accepting a new operation.
      board.controlUpdate = null;
      callback(result);
    };
    const closed = () => finish(completed(503, "Board disconnected before acknowledging. Check its status."));
    const timer = setTimeout(() => finish(completed(504, "Board acknowledgement timed out. Check its status.")), 5000);
    board.pendingControl = { msgid, finish };
    socket.once("close", closed);
    // Use the authenticated socket directly. The client queue retries commands
    // and can carry queued work across state changes.
    try {
      socket.send(JSON.stringify({ cmd: `${action}_watermaker`, msgid }), (error) => {
        if (error)
          finish(completed(502, "Unable to send the command to the watermaker."));
      });
    } catch {
      queueMicrotask(() => finish(completed(502, "Unable to send the command to the watermaker.")));
    }
    return { state: "PENDING" };
  }

  function handleMessage(board, data) {
    if (board.pendingControl && data.msgid === board.pendingControl.msgid) {
      const accepted = data.status === "ok" || data.status === "success";
      board.pendingControl.finish(accepted
        ? completed(200, "Watermaker acknowledged the command.")
        : completed(409, data.message || "Watermaker rejected the command."));
      return;
    }
    if (data.msg !== "update" || data.brineomatic !== true || typeof data.status !== "string" || !board.config)
      return;
    board.controlUpdate = { data, socket: board.ws, timestamp: Date.now() };
    const path = board.getMainBoardPath();
    if (registered.has(path))
      return;
    registered.add(path);
    for (const action of Object.keys(actions)) {
      const control = switchPath(path, action);
      app.registerPutHandler("vessels.self", control, (_context, _path, value, callback) => {
        if (value === false || value === 0)
          return completed(200, "Momentary control reset.");
        if (value !== true && value !== 1)
          return completed(400, "Send true or 1 to activate this control.");
        const matches = plugin.connections.filter((candidate) => candidate.getMainBoardPath() === path);
        if (matches.length > 1)
          return completed(409, "Multiple boards share this Signal K path.");
        return execute(matches[0], action, callback);
      });
      plugin.bus.queueConsolidated(control, 0, { description: `Momentary watermaker ${action} control` });
    }
  }

  function registerRoutes(router) {
    const readonly = router.access?.("readonly") ?? router;
    const readwrite = router.access?.("readwrite") ?? router;
    readonly.get("/watermakers", (_req, res) => {
      res.set("Cache-Control", "no-store").json(plugin.connections.map((board, index) => {
        const update = current(board);
        const path = board.getMainBoardPath();
        const telemetry = {};
        for (const field of fields) {
          if (update && Object.hasOwn(update, field))
            telemetry[field] = app.getSelfPath(`${path}.${field}`)?.value;
        }
        return {
          index,
          host: board.hostname,
          name: board.config?.config?.config?.name ?? board.config?.name ?? board.boardname,
          live: Boolean(update),
          busy: Boolean(board.pendingControl),
          telemetry,
          actions: Object.fromEntries(Object.keys(actions).map((action) => [action, available(board, action)])),
        };
      }));
    });
    readwrite.post("/watermakers/:index/:action", (req, res) => {
      if (!req.is("application/json"))
        return res.status(415).json({ message: "Use application/json." });
      const { index, action } = req.params;
      const board = /^(0|[1-9]\d*)$/.test(index) && plugin.connections[Number(index)];
      if (!board || !Object.hasOwn(actions, action))
        return res.status(404).json({ message: "Unknown watermaker or action." });
      if (req.body?.host !== board.hostname)
        return res.status(409).json({ message: "Board configuration changed. Refresh and try again." });
      const reply = (result) => res.status(result.statusCode).json(result);
      const result = execute(board, action, reply);
      if (result.state !== "PENDING")
        reply(result);
    });
  }

  function stop() {
    for (const board of plugin.connections)
      board.pendingControl?.finish(completed(503, "Brineomatic plugin stopped."));
    registered.clear();
  }

  return { handleMessage, registerRoutes, stop };
};
