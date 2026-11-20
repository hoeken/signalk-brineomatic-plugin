const root = "/plugins/signalk-brineomatic-plugin/watermakers";
const select = document.querySelector("#board");
const connection = document.querySelector("#connection");
const feedback = document.querySelector("#feedback");
const buttons = [...document.querySelectorAll("[data-action]")];
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const units = (suffix, convert = (value) => value) => (value) => `${number.format(convert(value))} ${suffix}`;
const duration = (seconds) => {
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, "0");
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${remaining}s`;
};

const groups = {
  controls: [
    ["Status", "status"],
    ["Runtime elapsed", "runtime_elapsed", duration],
    ["Run time remaining", "finish_countdown", duration],
    ["Next automatic flush", "next_flush_countdown", duration],
    ["Flush elapsed", "flush_elapsed", duration],
    ["Flush time remaining", "flush_countdown", duration],
    ["Last run", "run_result"],
    ["Last flush", "flush_result"],
  ],
  sensors: [
    ["Filter pressure", "filter_pressure", units("bar", (value) => value / 100000)],
    ["Membrane pressure", "membrane_pressure", units("bar", (value) => value / 100000)],
    ["Product salinity", "product_salinity|salinity", units("ppm")],
    ["Brine salinity", "brine_salinity", units("ppm")],
    ["Product flow", "product_flowrate|flowrate", units("L/h", (value) => value * 3600000)],
    ["Brine flow", "brine_flowrate", units("L/h", (value) => value * 3600000)],
    ["Total flow", "total_flowrate", units("L/h", (value) => value * 3600000)],
    ["Water temperature", "water_temperature", units("°C", (value) => value - 273.15)],
    ["Motor temperature", "motor_temperature", units("°C", (value) => value - 273.15)],
    ["Product volume", "volume", units("L", (value) => value * 1000)],
    ["Flush volume", "flush_volume", units("L", (value) => value * 1000)],
    ["Tank level", "tank_level", units("%", (value) => value * 100)],
  ],
  outputs: [
    ["Boost pump", "boost_pump_on", "On", "Off"],
    ["High-pressure pump", "high_pressure_pump_on", "On", "Off"],
    ["Diverter valve", "diverter_valve_open", "Open", "Closed"],
    ["Flush valve", "flush_valve_open", "Open", "Closed"],
    ["Cooling fan", "cooling_fan_on", "On", "Off"],
  ],
};

const tiles = Object.entries(groups).flatMap(([group, entries]) => entries.map(([label, field, format, off]) => {
  const tile = document.createElement("div");
  tile.className = "tile";
  const title = document.createElement("dt");
  const value = document.createElement("dd");
  title.textContent = label;
  tile.append(title, value);
  document.getElementById(group).append(tile);
  return { tile, value, fields: field.split("|"), format, off };
}));

let boards = [];
let pending = false;
let loadError = "";
let previousOptions = "";
let refreshId = 0;
const selected = () => boards.find((board) => String(board.index) === select.value);

function render() {
  const options = JSON.stringify(boards.map(({ index, name, host }) => [index, name, host]));
  if (options !== previousOptions) {
    const current = select.selectedOptions[0]?.dataset.host;
    select.replaceChildren(...boards.map(({ index, name, host }) => {
      const option = new Option(name || host, index);
      option.dataset.host = host;
      return option;
    }));
    const match = boards.find((board) => board.host === current);
    if (match)
      select.value = match.index;
    previousOptions = options;
  }
  select.disabled = pending || boards.length < 2;
  const board = selected();
  const status = loadError || (board?.live ? "Live telemetry" :
    board ? "Waiting for live board data" : "No watermaker boards configured");
  if (connection.textContent !== status)
    connection.textContent = status;
  connection.dataset.tone = board?.live ? "green" : "orange";
  for (const button of buttons)
    button.disabled = pending || !board?.actions[button.dataset.action];

  for (const { tile, value, fields, format, off } of tiles) {
    const raw = fields.map((field) => board?.telemetry[field]).find((entry) => entry != null);
    let text = "—";
    let tone = "";
    if (off && (typeof raw === "boolean" || raw === 0 || raw === 1)) {
      text = raw ? format : off;
      tone = raw ? "green" : "";
    } else if (typeof format === "function" && Number.isFinite(raw) &&
      (format !== duration || raw >= 0)) {
      text = format(raw);
    } else if (!format && typeof raw === "string") {
      text = raw.replaceAll("_", " ");
      if (raw.startsWith("ERR"))
        tone = "red";
      else if (raw === "RUNNING")
        tone = "green";
      else if (raw === "FLUSHING")
        tone = "teal";
    }
    if (value.textContent !== text)
      value.textContent = text;
    value.dataset.tone = tone;
    tile.hidden = fields[0] === "boost_pump_on" && raw == null;
  }
}

async function refresh() {
  const id = ++refreshId;
  try {
    const response = await fetch(root, { signal: AbortSignal.timeout(4500) });
    if (!response.ok)
      throw new Error(response.status === 401 || response.status === 403
        ? "Sign in to Signal K to view watermakers" : "Signal K telemetry unavailable");
    const result = await response.json();
    if (id !== refreshId)
      return;
    boards = result;
    loadError = "";
  } catch (error) {
    if (id !== refreshId)
      return;
    boards = [];
    loadError = error.name === "TimeoutError" || error instanceof TypeError
      ? "Signal K connection unavailable" : error.message;
  }
  render();
}

function announce(text, tone) {
  feedback.hidden = false;
  feedback.textContent = text;
  feedback.dataset.tone = tone;
}

select.addEventListener("change", () => {
  feedback.hidden = true;
  render();
});

for (const button of buttons) {
  button.addEventListener("click", async () => {
    const board = selected();
    const { action } = button.dataset;
    if (pending || !board?.actions[action])
      return;
    if (action !== "stop" && !window.confirm(`${button.textContent} watermaker on ${board.name || board.host}?`))
      return;
    pending = true;
    announce("Waiting for the watermaker to acknowledge…", "teal");
    render();
    try {
      const response = await fetch(`${root}/${board.index}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: board.host }),
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 401 || response.status === 403)
        throw new Error("Sign in to Signal K with write access to send commands.");
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message);
      announce(result.message, "green");
    } catch (error) {
      announce(error.name === "TimeoutError" || error instanceof TypeError
        ? "Command result unavailable. Check watermaker status before retrying." : error.message, "red");
    } finally {
      await refresh();
      pending = false;
      render();
    }
  });
}

async function poll() {
  if (!pending)
    await refresh();
  window.setTimeout(poll, 1000);
}

poll();
