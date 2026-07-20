# v1.4.0

_2026-07-20_

### Added

- **NMEA 2000 publishing of watermaker status (PGN 130567).** A new per-board "Enable Publishing to N2K" option (off by default) mirrors each board update onto the N2K bus via `nmea2000JsonOut`: watermaker state, pump and diverter valve states, salinity, water temperature, flow rates, and pressures, with the PGN's warning indicators derived from the board's run result.
- **SignalK → Brineomatic sensor forwarding.** New per-board options (`water_temperature_path`, `motor_temperature_path`, `tank_level_path`, `battery_level_path`) let the plugin subscribe to SignalK paths and push their values to the board, so it can use the boat's existing sensors. Temperatures are converted from SignalK's Kelvin to Celsius automatically, sends are rate-limited to the board's `update_interval`, and forwarding pauses while the board is disconnected.
- **Total runtime** now published at `watermaker.{boardname}.board.runtime` (seconds), polled from the board's lifetime stats once a minute.
- **Light/dark theme toggle** on the board landing page. It follows your OS preference by default, and a deliberate choice persists across visits.

### Changed

- Redesigned the board landing page: larger typography, bigger card icons, and a responsive one/two-column grid.

### Fixed

- Boards running **firmware 2.8.0+** no longer publish missing identity fields (name, hostname, UUID, firmware/hardware version). The new firmware nests these fields differently in its config message; the plugin now reads both layouts. Undefined values are also skipped before reaching SignalK, eliminating the "Delta is missing value" log errors.

# v1.3.0

_2026-07-04_

### Added

- **Remote access to each board's web UI.** The ESP32 boards can't run a VPN themselves, so the plugin can now serve any board's own web interface through the SignalK host, making it reachable remotely (e.g. over Tailscale). Enable it per board with the new `enable_proxy` and `proxy_port` settings — each enabled board gets its own dedicated port, and both HTTP and the board's live WebSocket are proxied transparently.
- **Landing page in the SignalK webapp list.** With one board proxied it opens straight to that board's UI; with several it shows a picker grid listing each board by name with live connection status.
- **Boards metadata endpoint** at `/plugins/signalk-brineomatic-plugin/boards`, listing the enabled boards and their proxy ports for anything that wants to discover them programmatically.
- Plugin logo and display name in the SignalK app store and webapp list.
- Automated testing and releases: a unit-test suite (`npm test` / `npm run test:coverage`) covering the plugin's modules, CI that runs it on every push and pull request, and tag-driven publishing to npm.

### Fixed

- The plugin no longer fails to start when configured entirely from schema defaults (no boards explicitly added yet). Previously startup could throw before any board was configured.

# v1.2.0

_2026-05-28_

### Added

- New `flush_volume` path (`watermaker.{boardname}.flush_volume`, m³) reporting how much water the current flush cycle has used.

### Changed

- Each board's configured `update_interval` is now honored correctly by the polling loop (previously a single interval could be applied across boards).
- Added lint/format tooling (ESLint + Prettier) with `lint`, `lint:fix`, `format`, and `format:check` scripts for anyone working on the plugin.

### Fixed

- **Membrane and filter pressures** now report correct values. They were being converted using a psi→Pa factor instead of bar→Pa, so readings came out far too high.
- **Countdown and elapsed timers** (`flush`, `run`, `pickle`, `depickle`, `next_flush`, and the rest) now report correct seconds. They were being divided as if the source were microseconds rather than milliseconds, throwing every timer off by a factor of 1000.

# v1.1.0

_2025-11-16_

### Added

- Support for the **Rev B Brineomatic board's** expanded telemetry, with units and descriptions published for each:
  - Product, brine, and total flow rates — `product_flowrate`, `brine_flowrate`, `total_flowrate` (m³/s)
  - Product and brine salinity — `product_salinity`, `brine_salinity` (mg/L)

### Changed

- Board supply voltage now reports on the correct `board.bus_voltage` path (it was previously attached to `board.uuid`).
- The original `flowrate` and `salinity` paths are kept as aliases for `product_flowrate` and `product_salinity`, so existing dashboards and integrations keep working.

# v1.0.0

_2025-03-29_

Initial release of the SignalK Brineomatic plugin, adapted from the Yarrboard SignalK plugin.

### Added

- **Multi-board support.** Connect to any number of Brineomatic controllers, each configured independently: `host`, `use_ssl`, `update_interval`, and optional login (`require_login`, `username`, `password`).
- **WebSocket connection** to each controller via `yarrboard-client`, with automatic config and telemetry polling.
- Live data published under `watermaker.{boardname}.*`:
  - **Board info:** `firmware_version`, `hardware_version`, `hostname`, `name`, `uptime`, `use_ssl`, `uuid`.
  - **Cycle status and results:** `status`, plus `run_result`, `flush_result`, `pickle_result`, `depickle_result`.
  - **Sensors:** `motor_temperature`, `water_temperature`, `flowrate`, `volume`, `salinity`, `filter_pressure`, `membrane_pressure`, `tank_level`.
  - **Actuator states:** `boost_pump_on`, `high_pressure_pump_on`, `diverter_valve_open`, `flush_valve_open`, `cooling_fan_on`.
  - **Timers:** `next_flush_countdown`, `runtime_elapsed`, `finish_countdown`, `flush_elapsed`, `flush_countdown`, `pickle_elapsed`, `pickle_countdown`, `depickle_elapsed`, `depickle_countdown`.
- Units and descriptions (SignalK meta) published for every path.
