# signalk-brineomatic-plugin

SignalK plugin for interfacing with [Brineomatic](https://brineomatic.com) watermaker controllers.  Now with reverse proxy for remote access via Tailscale or other VPN.

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
| `enable_n2k`      | `false`            | Publish watermaker status to the NMEA 2000 bus as PGN 130567 (see below) |
| `enable_proxy`    | `false`            | Serve this board's web UI on a local port for remote access (see below) |
| `proxy_port`      | `3200`             | Local port for this board's proxy (unique per board) |
| `water_temperature_path` | _(blank)_   | SignalK path to forward as source water temperature (see below) |
| `motor_temperature_path` | _(blank)_   | SignalK path to forward as pump motor temperature |
| `tank_level_path`        | _(blank)_   | SignalK path to forward as fresh water tank level |
| `battery_level_path`     | _(blank)_   | SignalK path to forward as battery state of charge |

## Sending sensor data to the board

If your boat already measures water temperature, tank level, etc. elsewhere on
the SignalK network, the plugin can forward those readings to the Brineomatic so
it can use them instead of (or in addition to) its own sensors. Set any of the
four `*_path` options to a SignalK path and the plugin subscribes to it and
pushes each value to the board; leave an option blank to disable it.

| Option                   | Example path                                    | Units sent to board |
| ------------------------ | ----------------------------------------------- | ------------------- |
| `water_temperature_path` | `environment.water.temperature`                 | °C (converted from SignalK's Kelvin) |
| `motor_temperature_path` | `propulsion.main.temperature`                   | °C (converted from SignalK's Kelvin) |
| `tank_level_path`        | `tanks.freshWater.0.currentLevel`               | ratio 0.0–1.0       |
| `battery_level_path`     | `electrical.batteries.0.capacity.stateOfCharge` | ratio 0.0–1.0       |

Updates are rate-limited to the board's `update_interval` and paused while the
board is disconnected.

## Publishing to NMEA 2000

With **Enable Publishing to N2K** ticked, the plugin broadcasts the board's
state on the NMEA 2000 bus as **PGN 130567 (Watermaker Input Setting and
Status)** every time an update arrives from the board (i.e. at the board's
`update_interval`). This requires a SignalK NMEA 2000 connection with output
enabled (e.g. a canbus/Actisense/YDGW connection with "Output Events" on).

Field mapping:

| PGN 130567 field           | Brineomatic source                        |
| -------------------------- | ----------------------------------------- |
| Watermaker Operating State | `status` (`RUNNING`→Running, `FLUSHING`→Flushing, `IDLE`/`PICKLED`→Stopped, `PICKLING`/`DEPICKLING`→Rinsing, `STARTUP`→Initiating, …) |
| Production Start/Stop      | `status == RUNNING`                       |
| Rinse Start/Stop, Flush Mode Status | `status == FLUSHING`             |
| Low Pressure Pump Status   | `boost_pump_on`                           |
| High Pressure Pump Status  | `high_pressure_pump_on`                   |
| Product Solenoid Valve Status | `diverter_valve_open` (open → Warning) |
| Filter Status              | Warning on `run_result` `ERR_FILTER_PRESSURE_*` |
| Sensor Status              | Warning on `run_result` `ERR_MEMBRANE_PRESSURE_*` (the PGN has no dedicated high-pressure warning field) |
| Salinity Status            | Warning on `run_result` `ERR_PRODUCT_SALINITY_*` |
| System Status              | Warning on any `run_result` `ERR_*`       |
| Oil Change Indicator Status | always OK                                |
| Salinity                   | `product_salinity` (ppm)                  |
| Product Water Temperature  | `water_temperature` (source water — the PGN's only temperature field) |
| Post-filter Pressure       | `filter_pressure`                         |
| System High Pressure       | `membrane_pressure`                       |
| Pre-filter Pressure, Feed Pressure | 0 (not measured by the board)     |
| Product Water Flow         | `product_flowrate` (L/h)                  |
| Brine Water Flow           | `brine_flowrate` (L/h)                    |
| Run Time                   | `runtime_elapsed` (current cycle; 0 when not reported) |

The warning indicators report OK until a run result says otherwise; fields the
board has not yet reported (emergency stop, unseen sensor values) are
transmitted as "unavailable". If you run several boards, note that PGN 130567
has no instance field — enable N2K publishing on only one board to avoid
conflicting data.

## Remote access (reverse proxy)

The Brineomatic board is an ESP32 on the boat LAN and can't run Tailscale itself,
so its web UI isn't reachable when you're away from the boat. This plugin can
stand up a transparent HTTP + WebSocket reverse proxy to each board so you can
reach the board's own UI remotely — e.g. over [Tailscale](https://tailscale.com/)
to the SignalK host.

**Setup**

1. In the plugin config, tick **Enable remote-access proxy?** for each board you
   want to reach, and give each one a unique **Proxy port** (e.g. `3200`, `3201`,
   …). Keep the port stable — it's part of the URL you'll bookmark.
2. Open the **Brineomatic** entry in the SignalK webapp list. With one board
   enabled it redirects straight to that board's UI; with several it shows a
   picker with each board's name and connection status.
3. Remotely, browse to the SignalK host over your VPN/Tailscale hostname; the
   proxy reuses whatever host you reached the page on and only swaps the port, so
   the same link works over Tailscale, LAN, or mDNS. Each board's UI is at
   `http://<sk-host>:<proxy_port>/`.

**Security notes**

- The proxy is **opt-in** — no port opens until you enable it for a board.
- The proxy port binds to all interfaces, so it's reachable over your VPN **and**
  the boat LAN, and it **bypasses SignalK's own authentication**. The board's own
  `require_login` (if enabled) still applies through the proxy. Treat your tailnet
  / LAN as the trust boundary and only enable the proxy on networks you trust.

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

## Development

Install dependencies and run the checks:

```sh
npm install
npm test          # run the test suite
npm run test:coverage   # run tests with a coverage report
npm run lint      # eslint
```

The tests use Node's built-in test runner (`node:test`, Node 18+) — no extra
test dependencies are needed. They cover:

- **`signalk-bus.js`** — delta/meta queuing, batching, de-duplication.
- **`index.js`** — the plugin schema, the `/boards` route, the yarrboard-client
  message routing, and the unit conversions applied to each update (°C→K,
  mL/h→m³/s, bar→Pa, ms→s, …). No board connection is opened.
- **`n2k-publisher.js`** — the PGN 130567 field mapping, status enum
  translation, unit conversions, and partial-update caching. Nothing is put on
  a real bus; the emitted canboat-JSON is asserted directly.
- **`board-proxy.js`** — descriptor filtering (enable/port/duplicate),
  target URL building, and the `/boards` metadata. `ReverseProxy` is stubbed so
  no ports are opened.
- **`reverse-proxy.js`** — real HTTP and WebSocket proxying over loopback
  sockets, header stripping, `502` on an unreachable upstream, and `EADDRINUSE`
  handling.
