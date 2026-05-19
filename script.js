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
  fileInput: document.querySelector("#file-input"),
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
    els.activityList.innerHTML = `<div class="activity-card"><strong>No files yet</strong><span>Import Garmin TCX, GPX, XML, or CSV files.</span></div>`;
    return;
  }

  els.activityList.replaceChildren(...state.activities.slice(-8).reverse().map((activity) => {
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
  for (const file of files) {
    const text = await file.text();
    const activity = parseActivity(file.name, text);
    if (activity) imported.push(activity);
  }
  state.activities.push(...imported);
  adaptFutureWorkouts();
  save();
  render();
}

function parseActivity(name, text) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return parseCsvActivity(name, text);
  return parseXmlActivity(name, text);
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

load();
render();
