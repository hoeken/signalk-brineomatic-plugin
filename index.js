const YarrboardClient = require('yarrboard-client');

module.exports = function (app) {
    var plugin = {};
  
    plugin.id = 'signalk-brineomatic-plugin';
    plugin.name = 'Brineomatic';
    plugin.description = 'SignalK plugin for the Brineomatic watermaker controller';
    
    plugin.connections = [];

    plugin.metas = {
        "name": {"units": "", "description": "User defined name of channel."},
        "hasPWM": {"units": "", "description": "Whether this channel hardware is capable of PWM (duty cycle, dimming, etc)"},
        "hasCurrent": {"units": "", "description": "Whether this channel has current monitoring."},
        "softFuse": {"units": "A", "description": "Software defined fuse, in amps."},
        "isDimmable": {"units": "", "description": "Whether the channel has dimming enabled or not."},
        "state": {"units": "", "description": "Whether the channel is on or not."},
        "duty": {"units": "%", "description": "Duty cycle as a ratio from 0 to 1"},
        "current": {"units": "A", "description": "Current in amps"},
        "aH": {"units": "aH", "description": "Consumed amp hours since board restart"},
        "wH": {"units": "wH", "description": "Consumed watt hours since board restart"},
    }

    plugin.start = function (options, restartPlugin) {
        // Here we put our plugin logic
        app.debug('Plugin started');
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

            if (data.hasOwnProperty("volume"))
              this.queueDelta(`${mainPath}.volume`, data.volume * 0.001);

            if (data.hasOwnProperty("salinity"))
              this.queueDelta(`${mainPath}.salinity`, data.salinity * 0.001);

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
              this.queueDelta(`${mainPath}.next_flush_countdown`, data.next_flush_countdown);

            if (data.hasOwnProperty("runtime_elapsed"))
              this.queueDelta(`${mainPath}.runtime_elapsed`, data.runtime_elapsed);

            if (data.hasOwnProperty("finish_countdown"))
              this.queueDelta(`${mainPath}.finish_countdown`, data.finish_countdown);

            if (data.hasOwnProperty("flush_elapsed"))
              this.queueDelta(`${mainPath}.flush_elapsed`, data.flush_elapsed);
            if (data.hasOwnProperty("flush_countdown"))
              this.queueDelta(`${mainPath}.flush_countdown`, data.flush_countdown);

            if (data.hasOwnProperty("pickle_elapsed"))
              this.queueDelta(`${mainPath}.pickle_elapsed`, data.pickle_elapsed);
            if (data.hasOwnProperty("pickle_countdown"))
              this.queueDelta(`${mainPath}.pickle_countdown`, data.pickle_countdown);
            
            if (data.hasOwnProperty("depickle_elapsed"))
              this.queueDelta(`${mainPath}.depickle_elapsed`, data.depickle_elapsed);
            if (data.hasOwnProperty("depickle_countdown"))
              this.queueDelta(`${mainPath}.depickle_countdown`, data.depickle_countdown);
          }
        }

        yb.handleConfig = function (data)
        {
            this.config = data;

            let mainPath = this.getMainBoardPath();

            //console.log(JSON.stringify(data));

            this.queueUpdate(`${mainPath}.board.firmware_version`, data.firmware_version, "", "Firmware version of the board.");
            this.queueUpdate(`${mainPath}.board.hardware_version`, data.hardware_version, "", "Hardware version of the board.");
            this.queueUpdate(`${mainPath}.board.name`, data.name, "", "User defined name of the board.");
            this.queueUpdate(`${mainPath}.board.uuid`, data.uuid, "", "Unique ID of the board.");
            this.queueUpdate(`${mainPath}.board.hostname`, data.hostname + ".local", "", "Hostname of the board");
            this.queueUpdate(`${mainPath}.board.use_ssl`, data.use_ssl, "", "Whether the app uses SSL or not");
            this.queueMeta(`${mainPath}.board.uptime`, "S", "Seconds since the last reboot");

            //some boards don't have this.
            if (data.bus_voltage)
                this.queueMeta(`${mainPath}.board.uuid`, "V", "Supply voltage to the board.");

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
                this.queueUpdate(`${mainPath}.board.uptime`, data.uptime, "S", "Uptime since the last reboot");

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