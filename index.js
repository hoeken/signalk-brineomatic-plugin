const YarrboardClient = require('yarrboard-client');

module.exports = function (app) {
    var plugin = {};
  
    plugin.id = 'signalk-brineomatic-plugin';
    plugin.name = 'Brineomatic';
    plugin.description = 'SignalK plugin for the Brineomatic watermaker controller';
    
    plugin.connections = [];

    plugin.start = function (options, restartPlugin) {
        // Here we put our plugin logic
        app.debug(`YarrboardClient.version: ${YarrboardClient.version}`);
        //app.debug('Schema: %s', stringify(options));

        for (board of options.config)
        {
            //app.debug('Board: %s', JSON.stringify(board));

            let brineomatic = plugin.createYarrboard(board.host.trim(), board.username, board.password, board.require_login, board.use_ssl);
            brineomatic.start();            

            plugin.connections.push(brineomatic);
        }
    };
  
    plugin.stop = function () {
        // Here we put logic we need when the plugin stops
        app.debug('Plugin stopped');

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
                type: 'array',
                title: 'Add board config',
                items: {
                    type: 'object',
                    properties: {
                        host: {
                            type: 'string',
                            title: 'Brineomatic hostname or IP',
                            default: 'brineomatic.local'
                        },
                        use_ssl: {
                            type: 'boolean',
                            title: 'Use SSL / HTTPS?',
                            default: false,
                        },
                        update_interval: {
                            type: 'number',
                            title: 'Update interval (ms)',
                            default: 1000
                        },
                        require_login: {
                            type: 'boolean',
                            title: 'Login required?',
                            default: false,
                        },
                        username: {
                            type: 'string',
                            title: 'Username',
                            default: 'admin',
                        },
                        password: {
                            type: 'string',
                            title: 'Password',
                            default: 'admin',
                        }    
                    }
                }
            }
        }
    };

    plugin.createYarrboard = function(hostname, username="admin", password="admin", require_login = false, use_ssl = false)
    {
        var yb = new YarrboardClient(hostname, username, password, require_login, use_ssl);

        yb.metaPaths = [];
        yb.metas = [];
        yb.deltas = [];

        yb.onmessage = function (data)
        {
            if (data.msg == "update")
                this.handleUpdate(data);
            else if (data.msg == "config")
                this.handleConfig(data);
            else if (data.msg = "status")
            {
                if (data.status == "error")
                    app.setPluginError(`[${this.hostname}] ${data.message}`);
                else if (data.status == "success")
                    app.setPluginStatus(`[${this.hostname}] ${data.message}`);
            }
        }
        
        yb.onopen = function (event) {
            this.getConfig();
            this.startUpdatePoller(board.update_interval);
        } 

        yb.queueDeltasAndUpdates = function (data) {

          let mainPath = this.getMainBoardPath();
          
          if (data.brineomatic) {
            
            if (data.hasOwnProperty("status"))
              this.queueDelta(`${mainPath}.status`, data.status);

            if (data.hasOwnProperty("run_result"))
              this.queueDelta(`${mainPath}.run_result`, data.run_result);

            if (data.hasOwnProperty("flush_result"))
              this.queueDelta(`${mainPath}.flush_result`, data.flush_result);

            if (data.hasOwnProperty("pickle_result"))
              this.queueDelta(`${mainPath}.pickle_result`, data.pickle_result);

            if (data.hasOwnProperty("depickle_result"))
              this.queueDelta(`${mainPath}.depickle_result`, data.depickle_result);

            if (data.hasOwnProperty("motor_temperature"))
              this.queueDelta(`${mainPath}.motor_temperature`, data.motor_temperature + 273.15);

            if (data.hasOwnProperty("water_temperature"))
              this.queueDelta(`${mainPath}.water_temperature`, data.water_temperature + 273.15);

            if (data.hasOwnProperty("flowrate"))
              this.queueDelta(`${mainPath}.flowrate`, data.flowrate / 3600000);
            if (data.hasOwnProperty("product_flowrate"))
              this.queueDelta(`${mainPath}.product_flowrate`, data.product_flowrate / 3600000);
            if (data.hasOwnProperty("brine_flowrate"))
              this.queueDelta(`${mainPath}.brine_flowrate`, data.brine_flowrate / 3600000);
            if (data.hasOwnProperty("total_flowrate"))
              this.queueDelta(`${mainPath}.total_flowrate`, data.total_flowrate / 3600000);

            if (data.hasOwnProperty("volume"))
              this.queueDelta(`${mainPath}.volume`, data.volume * 0.001);

            if (data.hasOwnProperty("salinity"))
              this.queueDelta(`${mainPath}.salinity`, data.salinity);
            if (data.hasOwnProperty("product_salinity"))
              this.queueDelta(`${mainPath}.product_salinity`, data.product_salinity);
            if (data.hasOwnProperty("brine_salinity"))
              this.queueDelta(`${mainPath}.brine_salinity`, data.brine_salinity);

            if (data.hasOwnProperty("filter_pressure"))
              this.queueDelta(`${mainPath}.filter_pressure`, data.filter_pressure * 6894.76);

            if (data.hasOwnProperty("membrane_pressure"))
              this.queueDelta(`${mainPath}.membrane_pressure`, data.membrane_pressure * 6894.76);

            if (data.hasOwnProperty("tank_level"))
              this.queueDelta(`${mainPath}.tank_level`, data.tank_level);
          
            if (data.hasOwnProperty("boost_pump_on"))
              this.queueDelta(`${mainPath}.boost_pump_on`, data.boost_pump_on);

            if (data.hasOwnProperty("high_pressure_pump_on"))
              this.queueDelta(`${mainPath}.high_pressure_pump_on`, data.high_pressure_pump_on);

            if (data.hasOwnProperty("diverter_valve_open"))
              this.queueDelta(`${mainPath}.diverter_valve_open`, data.diverter_valve_open);
                        
            if (data.hasOwnProperty("flush_valve_open"))
              this.queueDelta(`${mainPath}.flush_valve_open`, data.flush_valve_open);
          
            if (data.hasOwnProperty("cooling_fan_on"))
              this.queueDelta(`${mainPath}.cooling_fan_on`, data.cooling_fan_on);

            if (data.hasOwnProperty("next_flush_countdown"))
              this.queueDelta(`${mainPath}.next_flush_countdown`, Math.round(data.next_flush_countdown / 1000000));

            if (data.hasOwnProperty("runtime_elapsed"))
              this.queueDelta(`${mainPath}.runtime_elapsed`, Math.round(data.runtime_elapsed / 1000000));

            if (data.hasOwnProperty("finish_countdown"))
              this.queueDelta(`${mainPath}.finish_countdown`, Math.round(data.finish_countdown / 1000000));

            if (data.hasOwnProperty("flush_elapsed"))
              this.queueDelta(`${mainPath}.flush_elapsed`, Math.round(data.flush_elapsed / 1000000));
            if (data.hasOwnProperty("flush_countdown"))
              this.queueDelta(`${mainPath}.flush_countdown`, Math.round(data.flush_countdown / 1000000));

            if (data.hasOwnProperty("pickle_elapsed"))
              this.queueDelta(`${mainPath}.pickle_elapsed`, Math.round(data.pickle_elapsed / 1000000));
            if (data.hasOwnProperty("pickle_countdown"))
              this.queueDelta(`${mainPath}.pickle_countdown`, Math.round(data.pickle_countdown / 1000000));
            
            if (data.hasOwnProperty("depickle_elapsed"))
              this.queueDelta(`${mainPath}.depickle_elapsed`, Math.round(data.depickle_elapsed / 1000000));
            if (data.hasOwnProperty("depickle_countdown"))
              this.queueDelta(`${mainPath}.depickle_countdown`, Math.round(data.depickle_countdown / 1000000));
          }
        }

        yb.handleConfig = function (data)
        {
            this.config = data;

            let mainPath = this.getMainBoardPath();

            //console.log(JSON.stringify(data));

            this.queueUpdate(`${mainPath}.board.firmware_version`, data.firmware_version, "", "Firmware version of the board");
            this.queueUpdate(`${mainPath}.board.hardware_version`, data.hardware_version, "", "Hardware version of the board");
            this.queueUpdate(`${mainPath}.board.name`, data.name, "", "User defined name of the board");
            this.queueUpdate(`${mainPath}.board.uuid`, data.uuid, "", "Unique ID of the board");
            this.queueUpdate(`${mainPath}.board.hostname`, data.hostname + ".local", "", "Hostname of the board");
            this.queueUpdate(`${mainPath}.board.use_ssl`, data.use_ssl, "", "Whether the app uses SSL or not");
            this.queueMeta(`${mainPath}.board.uptime`, "s", "Seconds since the last reboot");

            //some boards don't have this.
            if (data.bus_voltage)
                this.queueMeta(`${mainPath}.board.bus_voltage`, "V", "Supply voltage to the board");

            this.queueMeta(`${mainPath}.status`, "", "Current status of watermaker");
            this.queueMeta(`${mainPath}.run_result`, "", "Result from last run cycle");
            this.queueMeta(`${mainPath}.flush_result`, "", "Result from last flush cycle");
            this.queueMeta(`${mainPath}.pickle_result`, "", "Result from last pickle cycle");
            this.queueMeta(`${mainPath}.depickle_result`, "", "Result from last depickle cycle");
            this.queueMeta(`${mainPath}.motor_temperature`, "K", "Motor temperature");
            this.queueMeta(`${mainPath}.water_temperature`, "K", "Source water temperature");
            this.queueMeta(`${mainPath}.flowrate`, "m3/s", "Product output flowrate");
            this.queueMeta(`${mainPath}.product_flowrate`, "m3/s", "Product output flowrate");
            this.queueMeta(`${mainPath}.brine_flowrate`, "m3/s", "Brine output flowrate");
            this.queueMeta(`${mainPath}.total_flowrate`, "m3/s", "Total output flowrate");
            this.queueMeta(`${mainPath}.volume`, "m3", "Product output volume total (this cycle)");
            this.queueMeta(`${mainPath}.salinity`, "mg/L", "Product output salinity (PPM)");
            this.queueMeta(`${mainPath}.product_salinity`, "mg/L", "Product output salinity (PPM)");
            this.queueMeta(`${mainPath}.brine_salinity`, "mg/L", "Brine output salinity (PPM)");
            this.queueMeta(`${mainPath}.filter_pressure`, "Pa", "Pre-filter Pressure");
            this.queueMeta(`${mainPath}.membrane_pressure`, "Pa", "Membrane Pressure");
            this.queueMeta(`${mainPath}.tank_level`, "ratio", "Tank level percentage");
            this.queueMeta(`${mainPath}.boost_pump_on`, "", "Status of the boost pump");
            this.queueMeta(`${mainPath}.high_pressure_pump_on`, "", "Status of the high pressure pump");
            this.queueMeta(`${mainPath}.diverter_valve_open`, "", "Status of the diverter valve");
            this.queueMeta(`${mainPath}.flush_valve_open`, "", "Status of the flush valve");
            this.queueMeta(`${mainPath}.cooling_fan_on`, "", "Status of the cooling fan");
            this.queueMeta(`${mainPath}.next_flush_countdown`, "s", "Time until next automatic flush cycle");
            this.queueMeta(`${mainPath}.runtime_elapsed`, "s", "Total elapsed time for watermaking cycle");
            this.queueMeta(`${mainPath}.finish_countdown`, "s", "Time until watermaker cycle completes (estimate)");
            this.queueMeta(`${mainPath}.flush_elapsed`, "s", "Time elapsed for flush cycle");
            this.queueMeta(`${mainPath}.flush_countdown`, "s", "Time until flush cycle completes");
            this.queueMeta(`${mainPath}.pickle_elapsed`, "s", "Time elapsed for pickle cycle");
            this.queueMeta(`${mainPath}.pickle_countdown`, "s", "Time until pickle cycle completes");
            this.queueMeta(`${mainPath}.depickle_elapsed`, "s", "Time for depickle cycle");
            this.queueMeta(`${mainPath}.depickle_countdown`, "s", "Time until depickle cycle completes");

            //common handler for config and update
            this.queueDeltasAndUpdates(data);

            //actually send them off now.
            this.sendUpdates();
        }

        yb.handleUpdate = function (data)
        {
            if (!this.config)
                return;

            //app.debug(JSON.stringify(data));

            let mainPath = this.getMainBoardPath();

            //some boards don't have this.
            if (data.bus_voltage)
                this.queueUpdate(`${mainPath}.board.bus_voltage`, data.bus_voltage, 'V', "Bus supply voltage");

            //store our uptime
            if (data.uptime)
                this.queueUpdate(`${mainPath}.board.uptime`, Math.round(data.uptime / 1000000), "s", "Uptime since the last reboot");

            //common handler for config and update
            this.queueDeltasAndUpdates(data);

            //actually send them off now.
            this.sendUpdates();
        }

        yb.getMainBoardPath = function (data)
        {
            return `watermaker.${this.config.hostname}`;
        }

        yb.queueUpdate = function (path, value, units, description)
        {
            this.queueDelta(path, value);
            this.queueMeta(path, units, description);
        }

        yb.queueDelta = function (path, value)
        {
            this.deltas.push({ "path": path, "value": value });
        }

        yb.queueMeta = function (path, units, description)
        {
            //only send it once
            if (this.metaPaths.includes(path))
                return;
            this.metaPaths.push(path);

            //add it to our array
            let meta = {
                "path": path,
                "value": {
                    "units": units,
                    "description": description
                }
            };

            this.metas.push(meta);
        }

        yb.sendDeltas = function ()
        {
            if (!this.deltas.length)
                return;

            //app.debug('Deltas: %s', this.deltas.length);

            app.handleMessage(plugin.id, {
                "updates": [{
                    "values": this.deltas
                }]
            });

            this.deltas = [];
        }

        yb.sendMetas = function ()
        {
            if (!this.metas.length)
                return;

            let update = {
                "updates": [{ 
                    "meta": this.metas
                }]
            };

            app.handleMessage(plugin.id, update);

            this.metas = [];
        }

        yb.sendUpdates = function ()
        {
            yb.sendDeltas();
            yb.sendMetas();
        }

        // yb.doSendJSON = function(context, path, value, callback)
        // {
        //     this.send(value, true);
        //
        //     return { state: 'COMPLETED', statusCode: 200 };
        // }
    
        return yb;
    }

    return plugin;
};