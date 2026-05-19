const raceDistances = {
  "5k": 3.1069,
  "10k": 6.2137,
  half: 13.1094,
  marathon: 26.2188,
};

const state = {
  plan: [],
  activities: [],
  settings: {},
  ignoredFiles: 0,
  importReport: "",
};

const els = {
  raceDistance: document.querySelector("#race-distance"),
  goalTime: document.querySelector("#goal-time"),
  planLength: document.querySelector("#plan-length"),
  runsPerWeek: document.querySelector("#runs-per-week"),
  weeklyMileage: document.querySelector("#weekly-mileage"),
  longRun: document.querySelector("#long-run"),
  recentDistance: document.querySelector("#recent-distance"),
  recentTime: document.querySelector("#recent-time"),
  restingHr: document.querySelector("#resting-hr"),
  maxHr: document.querySelector("#max-hr"),
  generatePlan: document.querySelector("#generate-plan"),
  recalculate: document.querySelector("#recalculate"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  folderInput: document.querySelector("#folder-input"),
  activityList: document.querySelector("#activity-list"),
  planGrid: document.querySelector("#plan-grid"),
  planNote: document.querySelector("#plan-note"),
  readiness: document.querySelector("#readiness"),
  projection: document.querySelector("#projection"),
};

function parseTimeToSeconds(value) {
  const parts = String(value).trim().split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatPace(secondsPerMile) {
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}/mi`;
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function secondsToHours(seconds) {
  return seconds / 3600;
}

function riegelPredict(timeSeconds, fromMiles, toMiles) {
  return timeSeconds * Math.pow(toMiles / fromMiles, 1.06);
}

function collectSettings() {
  return {
    race: els.raceDistance.value,
    goalSeconds: parseTimeToSeconds(els.goalTime.value),
    weeks: Number(els.planLength.value),
    runsPerWeek: Number(els.runsPerWeek.value),
    weeklyMileage: Number(els.weeklyMileage.value),
    longRun: Number(els.longRun.value),
    recentDistance: els.recentDistance.value,
    recentSeconds: parseTimeToSeconds(els.recentTime.value),
    restingHr: Number(els.restingHr.value),
    maxHr: Number(els.maxHr.value),
  };
}

function fitnessFromInputs(settings) {
  const raceMiles = raceDistances[settings.race];
  const goalPace = settings.goalSeconds / raceMiles;
  const recentMiles = raceDistances[settings.recentDistance] || raceMiles;
  const recentPrediction = settings.recentDistance === "none" || !settings.recentSeconds
    ? settings.goalSeconds * 1.18
    : riegelPredict(settings.recentSeconds, recentMiles, raceMiles);
  const mileageRatio = Math.min(1.25, settings.weeklyMileage / Math.max(10, raceMiles * 0.9));
  const longRunRatio = Math.min(1.25, settings.longRun / Math.max(4, raceMiles * 0.45));
  const readiness = Math.round(Math.max(35, Math.min(100, 100 - ((recentPrediction - settings.goalSeconds) / settings.goalSeconds) * 70 + (mileageRatio - 0.75) * 18 + (longRunRatio - 0.75) * 16)));

  return {
    raceMiles,
    goalPace,
    recentPrediction,
    readiness,
    easyPace: goalPace + 75,
    steadyPace: goalPace + 35,
    tempoPace: goalPace - 5,
    intervalPace: goalPace - 35,
  };
}

function hrRange(settings, low, high) {
  const reserve = settings.maxHr - settings.restingHr;
  const lo = Math.round(settings.restingHr + reserve * low);
  const hi = Math.round(settings.restingHr + reserve * high);
  return `${lo}-${hi} bpm`;
}

function workout(type, miles, detail, pace, hr, week, day) {
  return {
    id: `${week}-${day}-${type.replace(/\W+/g, "-")}`,
    type,
    miles: Math.max(0, Math.round(miles * 10) / 10),
    detail,
    pace,
    hr,
    status: "planned",
  };
}

function buildPlan() {
  const settings = collectSettings();
  const fitness = fitnessFromInputs(settings);
  const completionAdjustment = activityAdjustment();
  const startMiles = Math.max(6, settings.weeklyMileage * completionAdjustment.volume);
  const peakByRace = { "10k": 32, half: 42, marathon: 55 };
  const peakMiles = Math.max(startMiles + 6, Math.min(peakByRace[settings.race], startMiles * 1.85));
  const plan = [];

  for (let week = 1; week <= settings.weeks; week += 1) {
    const progress = week / settings.weeks;
    const isCutback = week % 4 === 0 && week < settings.weeks - 1;
    const isTaper = week > settings.weeks - 2;
    const ramp = startMiles + (peakMiles - startMiles) * Math.sin(progress * Math.PI / 2);
    const weeklyMiles = Math.max(5, ramp * (isCutback ? 0.82 : 1) * (isTaper ? 0.65 : 1));
    const longRunMiles = Math.min(settings.race === "marathon" ? 20 : settings.race === "half" ? 12 : 7, weeklyMiles * (settings.race === "10k" ? 0.28 : 0.36));
    const quality = week % 2 === 0 ? "Tempo" : "Intervals";
    const workouts = [];
    const easyMiles = Math.max(2, (weeklyMiles - longRunMiles - 5) / Math.max(1, settings.runsPerWeek - 2));

    workouts.push(workout("Easy", easyMiles, "Relaxed aerobic run", formatPace(fitness.easyPace), hrRange(settings, 0.62, 0.76), week, 1));
    workouts.push(workout(quality, Math.min(8, weeklyMiles * 0.18), quality === "Tempo" ? "Warm up, controlled tempo block, cool down" : "Short repeats with full control", formatPace(quality === "Tempo" ? fitness.tempoPace : fitness.intervalPace), hrRange(settings, 0.78, 0.9), week, 2));

    if (settings.runsPerWeek >= 4) workouts.push(workout("Easy", easyMiles, "Keep this one comfortable", formatPace(fitness.easyPace), hrRange(settings, 0.62, 0.76), week, 3));
    if (settings.runsPerWeek >= 5) workouts.push(workout("Steady", Math.min(7, easyMiles + 1), "Smooth but not hard", formatPace(fitness.steadyPace), hrRange(settings, 0.72, 0.82), week, 4));
    if (settings.runsPerWeek >= 6) workouts.push(workout("Recovery", Math.max(2, easyMiles - 1), "Very easy shakeout", formatPace(fitness.easyPace + 35), hrRange(settings, 0.58, 0.7), week, 5));

    workouts.push(workout("Long run", longRunMiles, "Stay controlled; finish with good form", formatPace(fitness.easyPace + 15), hrRange(settings, 0.65, 0.8), week, 6));
    plan.push({ week, weeklyMiles: Math.round(weeklyMiles), workouts });
  }

  state.settings = settings;
  state.plan = plan;
  updateSummary(fitness);
  save();
  render();
}

function activityAdjustment() {
  const recent = state.activities.slice(-8);
  const skipped = state.plan.flatMap((week) => week.workouts).filter((workoutItem) => workoutItem.status === "skipped").length;
  const complete = state.plan.flatMap((week) => week.workouts).filter((workoutItem) => workoutItem.status === "complete").length;
  const avgHr = recent.filter((activity) => activity.avgHr).reduce((sum, activity) => sum + activity.avgHr, 0) / Math.max(1, recent.filter((activity) => activity.avgHr).length);
  const highHr = avgHr && state.settings.maxHr ? avgHr > state.settings.maxHr * 0.84 : false;
  const missedPenalty = skipped > complete ? 0.88 : skipped > 2 ? 0.94 : 1;
  return {
    volume: missedPenalty * (highHr ? 0.94 : 1),
  };
}

function updateSummary(fitness = fitnessFromInputs(collectSettings())) {
  els.readiness.textContent = `Readiness ${fitness.readiness}%`;
  els.projection.textContent = `Projected ${formatTime(fitness.recentPrediction)}`;
}

function renderActivities() {
  if (!state.activities.length) {
    els.activityList.innerHTML = `
      <div class="activity-card">
        <strong>No recent files loaded yet</strong>
        <span>Import Garmin FIT, TCX, GPX, XML, or CSV files.</span>
        <span>Only the last six months will be used.</span>
        ${state.importReport ? `<span>${state.importReport}</span>` : ""}
      </div>
    `;
    return;
  }

  const summary = document.createElement("article");
  summary.className = "activity-card";
  summary.innerHTML = `
    <strong>${state.activities.length} recent workouts loaded</strong>
    <span>${state.ignoredFiles} older files ignored</span>
    <span>${Math.round(state.activities.reduce((sum, activity) => sum + activity.miles, 0))} total miles analyzed</span>
    ${state.importReport ? `<span>${state.importReport}</span>` : ""}
  `;

  els.activityList.replaceChildren(summary, ...state.activities.slice(-8).reverse().map((activity) => {
    const card = document.createElement("article");
    card.className = "activity-card";
    card.innerHTML = `
      <strong>${activity.name}</strong>
      <span>${activity.date || "Unknown date"}</span>
      <span>${activity.miles.toFixed(2)} mi • ${formatTime(activity.seconds)}</span>
      <span>${activity.avgHr ? `${activity.avgHr} bpm` : "HR unavailable"} • ${formatPace(activity.seconds / Math.max(0.1, activity.miles))}</span>
    `;
    return card;
  }));
}

function renderPlan() {
  if (!state.plan.length) {
    els.planGrid.innerHTML = "";
    return;
  }

  els.planNote.textContent = "Future workouts adapt when you import files or mark workouts complete/skipped.";
  els.planGrid.replaceChildren(...state.plan.map((week) => {
    const section = document.createElement("section");
    section.className = "week";
    const header = document.createElement("div");
    header.className = "week-header";
    header.innerHTML = `<span>Week ${week.week}</span><span>${week.weeklyMiles} mi</span>`;
    const workouts = document.createElement("div");
    workouts.className = "workouts";
    workouts.replaceChildren(...week.workouts.map((item) => renderWorkout(item)));
    section.append(header, workouts);
    return section;
  }));
}

function renderWorkout(item) {
  const card = document.createElement("article");
  card.className = `workout status-${item.status}`;
  card.innerHTML = `
    <span class="tag">${item.status}</span>
    <h3>${item.type} • ${item.miles} mi</h3>
    <p>${item.detail}</p>
    <p>${item.pace} • ${item.hr}</p>
  `;
  const actions = document.createElement("div");
  actions.className = "workout-actions";

  const done = document.createElement("button");
  done.type = "button";
  done.textContent = "Done";
  done.addEventListener("click", () => {
    item.status = "complete";
    save();
    render();
  });

  const skipped = document.createElement("button");
  skipped.type = "button";
  skipped.textContent = "Skipped";
  skipped.addEventListener("click", () => {
    item.status = "skipped";
    adaptFutureWorkouts();
    save();
    render();
  });

  actions.append(done, skipped);
  card.append(actions);
  return card;
}

function adaptFutureWorkouts() {
  const adjustment = activityAdjustment();
  state.plan.forEach((week) => {
    week.workouts.forEach((item) => {
      if (item.status !== "planned") return;
      item.miles = Math.round(item.miles * adjustment.volume * 10) / 10;
    });
  });
}

function render() {
  renderActivities();
  renderPlan();
  updateSummary();
}

async function importFiles(files) {
  const imported = [];
  const supported = files.filter((file) => /\.(fit|tcx|gpx|xml|csv)$/i.test(file.name));
  let ignored = 0;
  let failed = 0;

  for (const file of supported) {
    let activity = null;
    try {
      activity = await parseActivity(file);
    } catch {
      failed += 1;
      continue;
    }

    if (!activity) {
      failed += 1;
      continue;
    }

    if (isWithinLastSixMonths(activity.date)) {
      imported.push(activity);
    } else {
      ignored += 1;
    }
  }
  state.activities.push(...imported);
  state.ignoredFiles += ignored;
  state.importReport = `Last import: ${files.length} selected, ${imported.length} recent loaded, ${ignored} older ignored, ${failed} non-workout files skipped, ${files.length - supported.length} unsupported.`;
  adaptFutureWorkouts();
  save();
  render();
}

async function parseActivity(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".fit")) return parseFitActivity(file.name, await file.arrayBuffer());
  const text = await file.text();
  if (lower.endsWith(".csv")) return parseCsvActivity(file.name, text);
  return parseXmlActivity(file.name, text);
}

function isWithinLastSixMonths(dateText) {
  if (!dateText) return true;
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return true;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  cutoff.setHours(0, 0, 0, 0);
  return date >= cutoff;
}

function parseXmlActivity(name, text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) return null;
  const distanceNodes = [...doc.querySelectorAll("DistanceMeters")];
  const timeNodes = [...doc.querySelectorAll("Time, time")];
  const hrNodes = [...doc.querySelectorAll("HeartRateBpm Value, hr")];
  const lastDistance = Number(distanceNodes.at(-1)?.textContent || 0);
  const firstTime = Date.parse(timeNodes[0]?.textContent || "");
  const lastTime = Date.parse(timeNodes.at(-1)?.textContent || "");
  const seconds = Number.isFinite(firstTime) && Number.isFinite(lastTime) ? Math.max(1, (lastTime - firstTime) / 1000) : 0;
  const avgHr = Math.round(hrNodes.reduce((sum, node) => sum + Number(node.textContent || 0), 0) / Math.max(1, hrNodes.length));
  const miles = lastDistance ? lastDistance / 1609.344 : estimateMilesFromGpx(doc);
  if (!miles || !seconds) return null;
  return { name, date: timeNodes[0]?.textContent?.slice(0, 10) || "", miles, seconds, avgHr: avgHr || null };
}

function parseFitActivity(name, buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 14) return null;
  const headerSize = view.getUint8(0);
  const dataSize = view.getUint32(4, true);
  const dataEnd = Math.min(view.byteLength, headerSize + dataSize);
  const definitions = new Map();
  const records = [];
  const sessions = [];
  let offset = headerSize;

  while (offset < dataEnd) {
    const header = view.getUint8(offset);
    offset += 1;
    const compressed = Boolean(header & 0x80);
    const isDefinition = !compressed && Boolean(header & 0x40);
    const hasDeveloperFields = !compressed && Boolean(header & 0x20);
    const localType = compressed ? (header >> 5) & 0x03 : header & 0x0f;

    if (isDefinition) {
      const reserved = view.getUint8(offset);
      const architecture = view.getUint8(offset + 1);
      const littleEndian = architecture === 0;
      const globalMessage = littleEndian ? view.getUint16(offset + 2, true) : view.getUint16(offset + 2, false);
      const fieldCount = view.getUint8(offset + 4);
      offset += 5;
      const fields = [];
      for (let index = 0; index < fieldCount; index += 1) {
        const fieldNum = view.getUint8(offset);
        const size = view.getUint8(offset + 1);
        const baseType = view.getUint8(offset + 2);
        fields.push({ fieldNum, size, baseType });
        offset += 3;
      }
      const developerFields = [];
      if (hasDeveloperFields) {
        const developerFieldCount = view.getUint8(offset);
        offset += 1;
        for (let index = 0; index < developerFieldCount; index += 1) {
          developerFields.push({
            fieldNum: view.getUint8(offset),
            size: view.getUint8(offset + 1),
            developerDataIndex: view.getUint8(offset + 2),
          });
          offset += 3;
        }
      }
      definitions.set(localType, { reserved, littleEndian, globalMessage, fields, developerFields });
      continue;
    }

    const definition = definitions.get(localType);
    if (!definition) break;
    const values = {};
    for (const field of definition.fields) {
      values[field.fieldNum] = readFitValue(view, offset, field, definition.littleEndian);
      offset += field.size;
    }
    for (const field of definition.developerFields) {
      offset += field.size;
    }

    if (definition.globalMessage === 20) records.push(values);
    if (definition.globalMessage === 18) sessions.push(values);
  }

  const session = sessions.at(-1);
  const firstRecord = records[0];
  const lastRecord = records.at(-1);
  const startTimestamp = session?.[2] ?? firstRecord?.[253];
  const totalDistance = session?.[9] ? session[9] / 100 : (lastRecord?.[5] ? lastRecord[5] / 100 : 0);
  const seconds = session?.[8] ? session[8] / 1000 : Math.max(0, (lastRecord?.[253] ?? 0) - (firstRecord?.[253] ?? 0));
  const heartRates = records.map((record) => record[3]).filter((value) => value && value < 255);
  const avgHr = session?.[16] || Math.round(heartRates.reduce((sum, value) => sum + value, 0) / Math.max(1, heartRates.length)) || null;
  const sport = session?.[5];

  if (!totalDistance || !seconds) return null;

  return {
    name,
    date: fitDate(startTimestamp),
    miles: totalDistance / 1609.344,
    seconds,
    avgHr,
    sport,
  };
}

function readFitValue(view, offset, field, littleEndian) {
  const baseType = field.baseType;
  if (field.size > fitBaseTypeSize(baseType)) {
    const values = [];
    for (let index = 0; index < field.size; index += fitBaseTypeSize(baseType)) {
      values.push(readFitScalar(view, offset + index, baseType, littleEndian));
    }
    return values.find((value) => value !== null) ?? null;
  }
  return readFitScalar(view, offset, baseType, littleEndian);
}

function fitBaseTypeSize(baseType) {
  const normalized = baseType & 0x1f;
  return {
    0x00: 1,
    0x01: 1,
    0x02: 1,
    0x83: 2,
    0x84: 2,
    0x85: 4,
    0x86: 4,
    0x07: 1,
    0x88: 4,
    0x89: 8,
    0x0a: 1,
    0x8b: 2,
    0x8c: 2,
    0x8d: 4,
    0x8e: 4,
  }[baseType] ?? {
    0x03: 2,
    0x04: 2,
    0x05: 4,
    0x06: 4,
    0x08: 4,
    0x09: 8,
    0x0b: 2,
    0x0c: 2,
    0x0d: 4,
    0x0e: 4,
  }[normalized] ?? 1;
}

function readFitScalar(view, offset, baseType, littleEndian) {
  if (offset >= view.byteLength) return null;
  const normalized = baseType & 0x1f;
  switch (normalized) {
    case 0x00:
    case 0x02:
    case 0x0a:
    case 0x0d:
      return view.getUint8(offset);
    case 0x01:
      return view.getInt8(offset);
    case 0x04:
    case 0x0b:
      return view.getUint16(offset, littleEndian);
    case 0x03:
      return view.getInt16(offset, littleEndian);
    case 0x06:
    case 0x0c:
      return view.getUint32(offset, littleEndian);
    case 0x05:
      return view.getInt32(offset, littleEndian);
    case 0x08:
      return view.getFloat32(offset, littleEndian);
    case 0x09:
      return view.getFloat64(offset, littleEndian);
    case 0x0e:
      return Number(view.getBigInt64(offset, littleEndian));
    case 0x0f:
      return Number(view.getBigUint64(offset, littleEndian));
    case 0x07:
      return String.fromCharCode(view.getUint8(offset));
    default:
      return view.getUint8(offset);
  }
}

function fitDate(timestamp) {
  if (!timestamp) return "";
  const garminEpoch = Date.UTC(1989, 11, 31);
  return new Date(garminEpoch + timestamp * 1000).toISOString().slice(0, 10);
}

function estimateMilesFromGpx(doc) {
  const points = [...doc.querySelectorAll("trkpt")].map((node) => ({
    lat: Number(node.getAttribute("lat")),
    lon: Number(node.getAttribute("lon")),
  })).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    meters += haversine(points[index - 1], points[index]);
  }
  return meters / 1609.344;
}

function haversine(a, b) {
  const radius = 6371000;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function parseCsvActivity(name, text) {
  const rows = text.trim().split(/\r?\n/).map((row) => row.split(",").map((cell) => cell.trim()));
  const headers = rows.shift()?.map((header) => header.toLowerCase()) || [];
  const find = (...needles) => headers.findIndex((header) => needles.some((needle) => header.includes(needle)));
  const distanceIndex = find("distance");
  const timeIndex = find("time", "duration");
  const hrIndex = find("heart", "hr");
  const dateIndex = find("date");
  const totals = rows.reduce((acc, row) => {
    acc.distance += Number(row[distanceIndex] || 0);
    acc.seconds += parseTimeToSeconds(row[timeIndex] || 0);
    acc.hr += Number(row[hrIndex] || 0);
    acc.hrCount += Number(row[hrIndex] || 0) ? 1 : 0;
    acc.date ||= row[dateIndex] || "";
    return acc;
  }, { distance: 0, seconds: 0, hr: 0, hrCount: 0, date: "" });
  const miles = totals.distance > 100 ? totals.distance / 1609.344 : totals.distance;
  if (!miles || !totals.seconds) return null;
  return { name, date: totals.date, miles, seconds: totals.seconds, avgHr: totals.hrCount ? Math.round(totals.hr / totals.hrCount) : null };
}

function save() {
  localStorage.setItem("marathon-trainer-state", JSON.stringify(state));
}

function load() {
  const saved = localStorage.getItem("marathon-trainer-state");
  if (!saved) return;
  try {
    Object.assign(state, JSON.parse(saved));
  } catch {
    localStorage.removeItem("marathon-trainer-state");
  }
}

els.generatePlan.addEventListener("click", buildPlan);
els.recalculate.addEventListener("click", () => {
  adaptFutureWorkouts();
  save();
  render();
});
els.fileInput.addEventListener("change", (event) => {
  importFiles([...event.target.files]);
  event.target.value = "";
});
els.folderInput.addEventListener("change", (event) => {
  importFiles([...event.target.files]);
  event.target.value = "";
});
els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("dragging");
});
els.dropZone.addEventListener("dragleave", () => {
  els.dropZone.classList.remove("dragging");
});
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("dragging");
  importFiles([...event.dataTransfer.files]);
});

load();
render();
