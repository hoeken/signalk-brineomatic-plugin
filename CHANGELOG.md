# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-07-04

### Added

- Remote-access **reverse proxy**: each board's own web UI can be served on a dedicated local port so it's reachable remotely (e.g. over Tailscale to the SignalK host), even though the ESP32 board can't run a VPN itself. Opt-in per board via the new `enable_proxy` / `proxy_port` config fields.
- Discoverable landing webapp (`public/`) in the SignalK webapp list: a single enabled board redirects straight to its UI, multiple boards render a picker grid with names and live connection status.
- Metadata route `/plugins/signalk-brineomatic-plugin/boards` exposing the enabled boards and their proxy ports.
- New reusable modules: [reverse-proxy.js](reverse-proxy.js) (project-agnostic HTTP + WebSocket transparent proxy) and [signalk-board-proxy.js](signalk-board-proxy.js) (Brineomatic-agnostic SignalK helper managing the proxies and `/boards` route), so sibling SignalK plugins that expose an ESP32 board's webapp can lift them in.
- `http-proxy` dependency.

## [1.2.0] - 2026-05-28

### Added

- New [signalk-bus.js](signalk-bus.js) helper that encapsulates SignalK delta/meta queuing, separating the bus plumbing from the board-specific logic in [index.js](index.js).
- `flush_volume` path (`watermaker.{boardname}.flush_volume`, units `m³`) reporting the volume of water used in the current flush cycle.
- ESLint and Prettier configuration ([eslint.config.mjs](eslint.config.mjs), [.prettierrc.json](.prettierrc.json), [.prettierignore](.prettierignore)) along with `lint`, `lint:fix`, `format`, and `format:check` npm scripts.

### Changed

- `index.js` rewritten to route all SignalK writes through the new `SignalKBus` helper.
- Per-board `update_interval` is now threaded through `createYarrboard` onto the client instance, so the update poller uses the configured interval instead of a stale outer reference.
- Codebase reformatted to match the new Prettier/ESLint rules.

### Fixed

- Pressure conversions for `filter_pressure` and `membrane_pressure` now use the correct bar→Pa factor (`×100000`) instead of the previous psi→Pa factor (`×6894.76`).
- Countdown/elapsed time fields (`next_flush_countdown`, `runtime_elapsed`, `finish_countdown`, `flush_elapsed`, `flush_countdown`, `pickle_elapsed`, `pickle_countdown`, `depickle_elapsed`, `depickle_countdown`) now convert from milliseconds (`÷1000`) to seconds rather than from microseconds (`÷1000000`).
- Replaced `data.hasOwnProperty(...)` calls with `Object.hasOwn(...)` and tidied up loop variable declarations and unused parameters to clear lint errors.

## [1.1.0] - 2025-11-16

### Added

- Support for the Rev B Brineomatic board's expanded telemetry:
  - `product_flowrate`, `brine_flowrate`, `total_flowrate` (m³/s)
  - `product_salinity`, `brine_salinity` (mg/L)
- Meta entries describing the new flowrate and salinity paths.

### Changed

- Board supply voltage meta moved from `board.uuid` to the correct `board.bus_voltage` path.
- The legacy `flowrate` and `salinity` paths are retained as aliases of `product_flowrate` and `product_salinity` for backwards compatibility.

## [1.0.0] - 2025-03-29

### Added

- Initial release of the SignalK Brineomatic plugin, forked from the Yarrboard SignalK plugin.
- Multi-board support via the plugin configuration schema (`host`, `use_ssl`, `update_interval`, `require_login`, `username`, `password`).
- WebSocket connection to Brineomatic controllers using `yarrboard-client`, with automatic config and update polling.
- SignalK paths under `watermaker.{boardname}.*` for:
  - Board info: `firmware_version`, `hardware_version`, `hostname`, `name`, `uptime`, `use_ssl`, `uuid`.
  - Cycle status and results: `status`, `run_result`, `flush_result`, `pickle_result`, `depickle_result`.
  - Sensors: `motor_temperature`, `water_temperature`, `flowrate`, `volume`, `salinity`, `filter_pressure`, `membrane_pressure`, `tank_level`.
  - Actuator states: `boost_pump_on`, `high_pressure_pump_on`, `diverter_valve_open`, `flush_valve_open`, `cooling_fan_on`.
  - Timers: `next_flush_countdown`, `runtime_elapsed`, `finish_countdown`, `flush_elapsed`, `flush_countdown`, `pickle_elapsed`, `pickle_countdown`, `depickle_elapsed`, `depickle_countdown`.
- SignalK meta (units and descriptions) published for all paths.
