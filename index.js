const YarrboardClient = require("yarrboard-client");
const { SignalKBus } = require("./signalk-bus.js");

module.exports = function (app) {
  var plugin = {};

  plugin.id = "signalk-brineomatic-plugin";
  plugin.name = "Brineomatic";
  plugin.description = "SignalK plugin for the Brineomatic watermaker controller";

  plugin.bus = new SignalKBus(app, plugin.id);
  plugin.connections = [];

  plugin.start = function (options, restartPlugin) {
    // Here we put our plugin logic
    app.debug(`YarrboardClient.version: ${YarrboardClient.version}`);
    //app.debug('Schema: %s', stringify(options));

    for (board of options.config) {
      //app.debug('Board: %s', JSON.stringify(board));

      let brineomatic = plugin.createYarrboard(board.host.trim(), board.username, board.password, board.require_login, board.use_ssl);
      brineomatic.start();

      plugin.connections.push(brineomatic);
    }
  };

  plugin.stop = function () {
    // Here we put logic we need when the plugin stops
    app.debug("Plugin stopped");

    //close all our connections
    for (yb of plugin.connections)
      yb.close();
    plugin.connections = [];
  };

  plugin.schema = {
    title: "Brineomatic",
    type: "object",
    properties: {
      config: {
        type: "array",
        title: "Add board config",
        items: {
          type: "object",
          properties: {
            host: {
              type: "string",
              title: "Brineomatic hostname or IP",
              default: "brineomatic.local",
            },
            use_ssl: {
              type: "boolean",
              title: "Use SSL / HTTPS?",
              default: false,
            },
            update_interval: {
              type: "number",
              title: "Update interval (ms)",
              default: 1000,
            },
            require_login: {
              type: "boolean",
              title: "Login required?",
              default: false,
            },
            username: {
              type: "string",
              title: "Username",
              default: "admin",
            },
            password: {
              type: "string",
              title: "Password",
              default: "admin",
            },
          },
        },
      },
    },
  };

  plugin.createYarrboard = function (hostname, username = "admin", password = "admin", require_login = false, use_ssl = false) {
    var yb = new YarrboardClient(hostname, username, password, require_login, use_ssl);
    yb.bus = plugin.bus;

    yb.onmessage = function (data) {
      if (data.msg == "update")
        this.handleUpdate(data);
      else if (data.msg == "config")
        this.handleConfig(data);
      else if (data.msg == "status") {
        if (data.status == "error")
          app.setPluginError(`[${this.hostname}] ${data.message}`);
        else if (data.status == "success")
          app.setPluginStatus(`[${this.hostname}] ${data.message}`);
      }
    };

    yb.onopen = function (event) {
      this.getConfig();
      this.startUpdatePoller(board.update_interval);
    };

    yb.queueDeltasAndUpdates = function (data) {

      let mainPath = this.getMainBoardPath();

      if (data.brineomatic) {

        if (data.hasOwnProperty("status"))
          this.bus.queueDelta(`${mainPath}.status`, data.status);

        if (data.hasOwnProperty("run_result"))
          this.bus.queueDelta(`${mainPath}.run_result`, data.run_result);

        if (data.hasOwnProperty("flush_result"))
          this.bus.queueDelta(`${mainPath}.flush_result`, data.flush_result);

        if (data.hasOwnProperty("pickle_result"))
          this.bus.queueDelta(`${mainPath}.pickle_result`, data.pickle_result);

        if (data.hasOwnProperty("depickle_result"))
          this.bus.queueDelta(`${mainPath}.depickle_result`, data.depickle_result);

        if (data.hasOwnProperty("motor_temperature"))
          this.bus.queueDelta(`${mainPath}.motor_temperature`, data.motor_temperature + 273.15);

        if (data.hasOwnProperty("water_temperature"))
          this.bus.queueDelta(`${mainPath}.water_temperature`, data.water_temperature + 273.15);

        if (data.hasOwnProperty("flowrate"))
          this.bus.queueDelta(`${mainPath}.flowrate`, data.flowrate / 3600000);
        if (data.hasOwnProperty("product_flowrate"))
          this.bus.queueDelta(`${mainPath}.product_flowrate`, data.product_flowrate / 3600000);
        if (data.hasOwnProperty("brine_flowrate"))
          this.bus.queueDelta(`${mainPath}.brine_flowrate`, data.brine_flowrate / 3600000);
        if (data.hasOwnProperty("total_flowrate"))
          this.bus.queueDelta(`${mainPath}.total_flowrate`, data.total_flowrate / 3600000);

        if (data.hasOwnProperty("volume"))
          this.bus.queueDelta(`${mainPath}.volume`, data.volume * 0.001);
        if (data.hasOwnProperty("flush_volume"))
          this.bus.queueDelta(`${mainPath}.flush_volume`, data.flush_volume * 0.001);

        if (data.hasOwnProperty("salinity"))
          this.bus.queueDelta(`${mainPath}.salinity`, data.salinity);
        if (data.hasOwnProperty("product_salinity"))
          this.bus.queueDelta(`${mainPath}.product_salinity`, data.product_salinity);
        if (data.hasOwnProperty("brine_salinity"))
          this.bus.queueDelta(`${mainPath}.brine_salinity`, data.brine_salinity);

        if (data.hasOwnProperty("filter_pressure"))
          this.bus.queueDelta(`${mainPath}.filter_pressure`, data.filter_pressure * 100000);

        if (data.hasOwnProperty("membrane_pressure"))
          this.bus.queueDelta(`${mainPath}.membrane_pressure`, data.membrane_pressure * 100000);

        if (data.hasOwnProperty("tank_level"))
          this.bus.queueDelta(`${mainPath}.tank_level`, data.tank_level);

        if (data.hasOwnProperty("boost_pump_on"))
          this.bus.queueDelta(`${mainPath}.boost_pump_on`, data.boost_pump_on);

        if (data.hasOwnProperty("high_pressure_pump_on"))
          this.bus.queueDelta(`${mainPath}.high_pressure_pump_on`, data.high_pressure_pump_on);

        if (data.hasOwnProperty("diverter_valve_open"))
          this.bus.queueDelta(`${mainPath}.diverter_valve_open`, data.diverter_valve_open);

        if (data.hasOwnProperty("flush_valve_open"))
          this.bus.queueDelta(`${mainPath}.flush_valve_open`, data.flush_valve_open);

        if (data.hasOwnProperty("cooling_fan_on"))
          this.bus.queueDelta(`${mainPath}.cooling_fan_on`, data.cooling_fan_on);

        if (data.hasOwnProperty("next_flush_countdown"))
          this.bus.queueDelta(`${mainPath}.next_flush_countdown`, Math.round(data.next_flush_countdown / 1000));

        if (data.hasOwnProperty("runtime_elapsed"))
          this.bus.queueDelta(`${mainPath}.runtime_elapsed`, Math.round(data.runtime_elapsed / 1000));

        if (data.hasOwnProperty("finish_countdown"))
          this.bus.queueDelta(`${mainPath}.finish_countdown`, Math.round(data.finish_countdown / 1000));

        if (data.hasOwnProperty("flush_elapsed"))
          this.bus.queueDelta(`${mainPath}.flush_elapsed`, Math.round(data.flush_elapsed / 1000));
        if (data.hasOwnProperty("flush_countdown"))
          this.bus.queueDelta(`${mainPath}.flush_countdown`, Math.round(data.flush_countdown / 1000));

        if (data.hasOwnProperty("pickle_elapsed"))
          this.bus.queueDelta(`${mainPath}.pickle_elapsed`, Math.round(data.pickle_elapsed / 1000));
        if (data.hasOwnProperty("pickle_countdown"))
          this.bus.queueDelta(`${mainPath}.pickle_countdown`, Math.round(data.pickle_countdown / 1000));

        if (data.hasOwnProperty("depickle_elapsed"))
          this.bus.queueDelta(`${mainPath}.depickle_elapsed`, Math.round(data.depickle_elapsed / 1000));
        if (data.hasOwnProperty("depickle_countdown"))
          this.bus.queueDelta(`${mainPath}.depickle_countdown`, Math.round(data.depickle_countdown / 1000));
      }
    };

    yb.handleConfig = function (data) {
      this.config = data;

      let mainPath = this.getMainBoardPath();

      //console.log(JSON.stringify(data));

      this.bus.queueConsolidated(`${mainPath}.board.firmware_version`, data.firmware_version, { description: "Firmware version of the board" });
      this.bus.queueConsolidated(`${mainPath}.board.hardware_version`, data.hardware_version, { description: "Hardware version of the board" });
      this.bus.queueConsolidated(`${mainPath}.board.name`, data.name, { description: "User defined name of the board" });
      this.bus.queueConsolidated(`${mainPath}.board.uuid`, data.uuid, { description: "Unique ID of the board" });
      this.bus.queueConsolidated(`${mainPath}.board.hostname`, this.hostname, { description: "Hostname of the board" });
      this.bus.queueConsolidated(`${mainPath}.board.use_ssl`, data.use_ssl, { description: "Whether the app uses SSL or not" });
      this.bus.queueMeta(`${mainPath}.board.uptime`, { units: "s", description: "Seconds since the last reboot" });

      //some boards don't have this.
      if (data.bus_voltage)
        this.bus.queueMeta(`${mainPath}.board.bus_voltage`, { units: "V", description: "Supply voltage to the board" });

      this.bus.queueMeta(`${mainPath}.status`, { description: "Current status of watermaker" });
      this.bus.queueMeta(`${mainPath}.run_result`, { description: "Result from last run cycle" });
      this.bus.queueMeta(`${mainPath}.flush_result`, { description: "Result from last flush cycle" });
      this.bus.queueMeta(`${mainPath}.pickle_result`, { description: "Result from last pickle cycle" });
      this.bus.queueMeta(`${mainPath}.depickle_result`, { description: "Result from last depickle cycle" });
      this.bus.queueMeta(`${mainPath}.motor_temperature`, { units: "K", description: "Motor temperature" });
      this.bus.queueMeta(`${mainPath}.water_temperature`, { units: "K", description: "Source water temperature" });
      this.bus.queueMeta(`${mainPath}.flowrate`, { units: "m3/s", description: "Product output flowrate" });
      this.bus.queueMeta(`${mainPath}.product_flowrate`, { units: "m3/s", description: "Product output flowrate" });
      this.bus.queueMeta(`${mainPath}.brine_flowrate`, { units: "m3/s", description: "Brine output flowrate" });
      this.bus.queueMeta(`${mainPath}.total_flowrate`, { units: "m3/s", description: "Total output flowrate" });
      this.bus.queueMeta(`${mainPath}.volume`, { units: "m3", description: "Product output volume total (this cycle)" });
      this.bus.queueMeta(`${mainPath}.flush_volume`, { units: "m3", description: "Flush volume total (this cycle)" });
      this.bus.queueMeta(`${mainPath}.salinity`, { units: "PPM", description: "Product output salinity (PPM)" });
      this.bus.queueMeta(`${mainPath}.product_salinity`, { units: "PPM", description: "Product output salinity (PPM)" });
      this.bus.queueMeta(`${mainPath}.brine_salinity`, { units: "PPM", description: "Brine output salinity (PPM)" });
      this.bus.queueMeta(`${mainPath}.filter_pressure`, { units: "Pa", description: "Pre-filter Pressure" });
      this.bus.queueMeta(`${mainPath}.membrane_pressure`, { units: "Pa", description: "Membrane Pressure" });
      this.bus.queueMeta(`${mainPath}.tank_level`, { units: "ratio", description: "Tank level percentage" });
      this.bus.queueMeta(`${mainPath}.boost_pump_on`, { description: "Status of the boost pump" });
      this.bus.queueMeta(`${mainPath}.high_pressure_pump_on`, { description: "Status of the high pressure pump" });
      this.bus.queueMeta(`${mainPath}.diverter_valve_open`, { description: "Status of the diverter valve" });
      this.bus.queueMeta(`${mainPath}.flush_valve_open`, { description: "Status of the flush valve" });
      this.bus.queueMeta(`${mainPath}.cooling_fan_on`, { description: "Status of the cooling fan" });
      this.bus.queueMeta(`${mainPath}.next_flush_countdown`, { units: "s", description: "Time until next automatic flush cycle" });
      this.bus.queueMeta(`${mainPath}.runtime_elapsed`, { units: "s", description: "Total elapsed time for watermaking cycle" });
      this.bus.queueMeta(`${mainPath}.finish_countdown`, { units: "s", description: "Time until watermaker cycle completes (estimate)" });
      this.bus.queueMeta(`${mainPath}.flush_elapsed`, { units: "s", description: "Time elapsed for flush cycle" });
      this.bus.queueMeta(`${mainPath}.flush_countdown`, { units: "s", description: "Time until flush cycle completes" });
      this.bus.queueMeta(`${mainPath}.pickle_elapsed`, { units: "s", description: "Time elapsed for pickle cycle" });
      this.bus.queueMeta(`${mainPath}.pickle_countdown`, { units: "s", description: "Time until pickle cycle completes" });
      this.bus.queueMeta(`${mainPath}.depickle_elapsed`, { units: "s", description: "Time for depickle cycle" });
      this.bus.queueMeta(`${mainPath}.depickle_countdown`, { units: "s", description: "Time until depickle cycle completes" });

      //common handler for config and update
      this.queueDeltasAndUpdates(data);

      //actually send them off now.
      this.bus.sendUpdates();
    };

    yb.handleUpdate = function (data) {
      if (!this.config)
        return;

      //app.debug(JSON.stringify(data));

      let mainPath = this.getMainBoardPath();

      //some boards don't have this.
      if (data.bus_voltage)
        this.bus.queueConsolidated(`${mainPath}.board.bus_voltage`, data.bus_voltage, { units: "V", description: "Bus supply voltage" });

      //store our uptime
      if (data.uptime)
        this.bus.queueConsolidated(`${mainPath}.board.uptime`, Math.round(data.uptime / 1000000), { units: "s", description: "Uptime since the last reboot" });

      //common handler for config and update
      this.queueDeltasAndUpdates(data);

      //actually send them off now.
      this.bus.sendUpdates();
    };

    yb.getMainBoardPath = function (data) {
      return `watermaker.${this.boardname}`;
    };

    return yb;
  };

  return plugin;
};
