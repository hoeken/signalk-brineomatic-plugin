# signalk-brineomatic-plugin

SignalK plugin for interfacing with [Brineomatic](https://brineomatic.com) watermaker controllers.

## Setup

Add your board hosts and configure login info in the plugin preferences. Per-board options:

| Option            | Default            | Description                                |
| ----------------- | ------------------ | ------------------------------------------ |
| `host`            | `brineomatic.local`| Hostname or IP of the Brineomatic board    |
| `use_ssl`         | `false`            | Connect via HTTPS / WSS                    |
| `update_interval` | `1000`             | Update poll interval in milliseconds       |
| `require_login`   | `false`            | Whether the board requires authentication  |
| `username`        | `admin`            | Username (if login required)               |
| `password`        | `admin`            | Password (if login required)               |

## SignalK Path Info

```{boardname}``` is your board hostname, defaults to ```brineomatic```

| Path                                                     | Units | Description              |
| -------------------------------------------------------- | ----- | ------------------------ |
| `watermaker.{boardname}.board.firmware_version`          |       | Firmware version         |
| `watermaker.{boardname}.board.hardware_version`          |       | Hardware version         |
| `watermaker.{boardname}.board.hostname`                  |       | Local board hostname     |
| `watermaker.{boardname}.board.name`                      |       | User friendly name       |
| `watermaker.{boardname}.board.uptime`                    | s     | Controller uptime        |
| `watermaker.{boardname}.board.use_ssl`                   |       | Does the board use SSL?  |
| `watermaker.{boardname}.board.uuid`                      |       | Unique ID of the board   |
| `watermaker.{boardname}.board.bus_voltage`               | V     | Supply voltage to the board (if reported) |


The rest of the data is located at watermaker.{boardname}.*:

| Path                                                      | Units  | Description                                      |
| --------------------------------------------------------- | ------ | ------------------------------------------------ |
| `watermaker.{boardname}.status`                           |        | Current status of watermaker                     |
| `watermaker.{boardname}.run_result`                       |        | Result from last run cycle                       |
| `watermaker.{boardname}.flush_result`                     |        | Result from last flush cycle                     |
| `watermaker.{boardname}.pickle_result`                    |        | Result from last pickle cycle                    |
| `watermaker.{boardname}.depickle_result`                  |        | Result from last depickle cycle                  |
| `watermaker.{boardname}.motor_temperature`                | K      | Motor temperature                                |
| `watermaker.{boardname}.water_temperature`                | K      | Source water temperature                         |
| `watermaker.{boardname}.flowrate`                         | m³/s   | Product output flowrate (legacy alias of `product_flowrate`) |
| `watermaker.{boardname}.product_flowrate`                 | m³/s   | Product output flowrate                          |
| `watermaker.{boardname}.brine_flowrate`                   | m³/s   | Brine output flowrate                            |
| `watermaker.{boardname}.total_flowrate`                   | m³/s   | Total output flowrate                            |
| `watermaker.{boardname}.volume`                           | m³     | Product output volume total (this cycle)         |
| `watermaker.{boardname}.flush_volume`                     | m³     | Flush volume total (this cycle)                  |
| `watermaker.{boardname}.salinity`                         | PPM    | Product output salinity (legacy alias of `product_salinity`) |
| `watermaker.{boardname}.product_salinity`                 | PPM    | Product output salinity                          |
| `watermaker.{boardname}.brine_salinity`                   | PPM    | Brine output salinity                            |
| `watermaker.{boardname}.filter_pressure`                  | Pa     | Pre-filter Pressure                              |
| `watermaker.{boardname}.membrane_pressure`                | Pa     | Membrane Pressure                                |
| `watermaker.{boardname}.tank_level`                       | ratio  | Tank level percentage                            |
| `watermaker.{boardname}.boost_pump_on`                    |        | Status of the boost pump                         |
| `watermaker.{boardname}.high_pressure_pump_on`            |        | Status of the high pressure pump                 |
| `watermaker.{boardname}.diverter_valve_open`              |        | Status of the diverter valve                     |
| `watermaker.{boardname}.flush_valve_open`                 |        | Status of the flush valve                        |
| `watermaker.{boardname}.cooling_fan_on`                   |        | Status of the cooling fan                        |
| `watermaker.{boardname}.next_flush_countdown`             | s      | Time until next automatic flush cycle            |
| `watermaker.{boardname}.runtime_elapsed`                  | s      | Total elapsed time for watermaking cycle         |
| `watermaker.{boardname}.finish_countdown`                 | s      | Time until watermaker cycle completes (estimate) |
| `watermaker.{boardname}.flush_elapsed`                    | s      | Time elapsed for flush cycle                     |
| `watermaker.{boardname}.flush_countdown`                  | s      | Time until flush cycle completes                 |
| `watermaker.{boardname}.pickle_elapsed`                   | s      | Time elapsed for pickle cycle                    |
| `watermaker.{boardname}.pickle_countdown`                 | s      | Time until pickle cycle completes                |
| `watermaker.{boardname}.depickle_elapsed`                 | s      | Time elapsed for depickle cycle                  |
| `watermaker.{boardname}.depickle_countdown`               | s      | Time until depickle cycle completes              |
