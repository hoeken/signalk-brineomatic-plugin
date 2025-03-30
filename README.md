# signalk-yarrboard-plugin

SignalK plugin for interfacing with [Brineomatic](https://github.com/hoeken/brineomatic) watermaker controllers.

## Setup

Add your board hosts and configure login info in the plugin preferences

## SignalK Path Info

```{boardname}``` is your board hostname, defaults to ```brineomatic```

| Path                                                     | Description              |
| --------------------------------------------------------- | ------------------------ |
| `watermaker.{boardname}.board.firmware_version`          | firmware version         |
| `watermaker.{boardname}.board.hardware_version`          | hardware version         |
| `watermaker.{boardname}.board.hostname`                  | local board hostname     |
| `watermaker.{boardname}.board.name`                      | User friendly name       |
| `watermaker.{boardname}.board.uptime`                    | controller uptime        |
| `watermaker.{boardname}.board.use_ssl`                   | do we use ssl?           |
| `watermaker.{boardname}.board.uuid`                      | unique id of the board   |


The rest of the data is located at watermaker.{boardname}.*:

| Path                                                      | Units  | Description                                      |
| --------------------------------------------------------- | ------ | ------------------------------------------------ |
| `watermaker.{boardname}.status`                          |        | Current status of watermaker                    |
| `watermaker.{boardname}.run_result`                      |        | Result from last run cycle                      |
| `watermaker.{boardname}.flush_result`                    |        | Result from last flush cycle                    |
| `watermaker.{boardname}.pickle_result`                   |        | Result from last pickle cycle                   |
| `watermaker.{boardname}.depickle_result`                 |        | Result from last depickle cycle                 |
| `watermaker.{boardname}.motor_temperature`               | K      | Motor temperature                               |
| `watermaker.{boardname}.water_temperature`               | K      | Source water temperature                        |
| `watermaker.{boardname}.flowrate`                        | m³/s   | Product output flowrate                         |
| `watermaker.{boardname}.volume`                          | m³     | Product output volume total (this cycle)        |
| `watermaker.{boardname}.salinity`                        | mg/L   | Product output salinity (PPM)                   |
| `watermaker.{boardname}.filter_pressure`                 | Pa     | Pre-filter Pressure                             |
| `watermaker.{boardname}.membrane_pressure`               | Pa     | Membrane Pressure                               |
| `watermaker.{boardname}.tank_level`                      | ratio  | Tank level percentage                           |
| `watermaker.{boardname}.boost_pump_on`                   |        | Status of the boost pump                        |
| `watermaker.{boardname}.high_pressure_pump_on`           |        | Status of the high pressure pump                |
| `watermaker.{boardname}.diverter_valve_open`             |        | Status of the diverter valve                    |
| `watermaker.{boardname}.flush_valve_open`                |        | Status of the flush valve                       |
| `watermaker.{boardname}.cooling_fan_on`                  |        | Status of the cooling fan                       |
| `watermaker.{boardname}.next_flush_countdown`            | s      | Time until next automatic flush cycle           |
| `watermaker.{boardname}.runtime_elapsed`                 | s      | Total elapsed time for watermaking cycle        |
| `watermaker.{boardname}.finish_countdown`                | s      | Time until watermaker cycle completes (estimate)|
| `watermaker.{boardname}.flush_elapsed`                   | s      | Time elapsed for flush cycle                    |
| `watermaker.{boardname}.flush_countdown`                 | s      | Time until flush cycle completes                |
| `watermaker.{boardname}.pickle_elapsed`                  | s      | Time elapsed for pickle cycle                   |
| `watermaker.{boardname}.pickle_countdown`                | s      | Time until pickle cycle completes               |
| `watermaker.{boardname}.depickle_elapsed`                | s      | Time for depickle cycle                         |
| `watermaker.{boardname}.depickle_countdown`              | s      | Time until depickle cycle completes             |
