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
  performanceNote: "",
};

const els = {
  runnerName: document.querySelector("#runner-name"),
  birthdate: document.querySelector("#birthdate"),
  raceDistance: document.querySelector("#race-distance"),
  goalTime: document.querySelector("#goal-time"),
  planLength: document.querySelector("#plan-length"),
  runsPerWeek: document.querySelector("#runs-per-week"),
  planStart: document.querySelector("#plan-start"),
  restingHr: document.querySelector("#resting-hr"),
  maxHr: document.querySelector("#max-hr"),
  generatePlan: document.querySelector("#generate-plan"),
  recalculate: document.querySelector("#recalculate"),
  updateAfterWorkout: document.querySelector("#update-after-workout"),
  stravaButton: document.querySelector("#strava-button"),
  dropZone: document.querySelector("#drop-zone"),
  fileInput: document.querySelector("#file-input"),
  folderInput: document.querySelector("#folder-input"),
  activityList: document.querySelector("#activity-list"),
  planGrid: document.querySelector("#plan-grid"),
  planNote: document.querySelector("#plan-note"),
  readiness: document.querySelector("#readiness"),
  projection: document.querySelector("#projection"),
  assessment: document.querySelector("#assessment"),
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(dateText, days) {
  const date = new Date(`${dateText || todayIso()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateText) {
  if (!dateText) return "";
  const date = new Date(`${dateText}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateText;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function calculateAge(birthdate, onDate = new Date()) {
  if (!birthdate) return null;
  const born = new Date(`${birthdate}T12:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  let age = onDate.getFullYear() - born.getFullYear();
  const birthdayThisYear = new Date(onDate.getFullYear(), born.getMonth(), born.getDate());
  if (onDate < birthdayThisYear) age -= 1;
  return age > 0 ? age : null;
}

function riegelPredict(timeSeconds, fromMiles, toMiles) {
  return timeSeconds * Math.pow(toMiles / fromMiles, 1.06);
}

function recentActivities(days = 183) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return state.activities
    .filter((activity) => {
      const date = new Date(activity.date);
      return !Number.isNaN(date.getTime()) && date >= cutoff;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function activityMetrics() {
  const activities = recentActivities();
  if (!activities.length) return null;

  const newestDate = new Date(activities.at(-1).date);
  const daysSinceLatest = Math.max(0, Math.round((Date.now() - newestDate.getTime()) / 86400000));
  const last28Cutoff = new Date();
  last28Cutoff.setDate(last28Cutoff.getDate() - 28);
  const last28 = activities.filter((activity) => new Date(activity.date) >= last28Cutoff);
  const totalMiles = activities.reduce((sum, activity) => sum + activity.miles, 0);
  const last28Miles = last28.reduce((sum, activity) => sum + activity.miles, 0);
  const weeklyMiles = last28Miles / 4;
  const longRun = Math.max(...activities.map((activity) => activity.miles));
  const recentLongRun = Math.max(0, ...last28.map((activity) => activity.miles));
  const avgHrActivities = activities.filter((activity) => activity.avgHr);
  const maxHrActivities = activities.filter((activity) => activity.maxHr || activity.avgHr);
  const peakHrActivities = activities.filter((activity) => activity.maxHr);
  const avgHr = avgHrActivities.reduce((sum, activity) => sum + activity.avgHr, 0) / Math.max(1, avgHrActivities.length);
  const observedPeakHr = Math.max(0, ...maxHrActivities.map((activity) => activity.maxHr || activity.avgHr));
  const bestEffort = activities
    .filter((activity) => activity.miles >= 2 && activity.seconds >= 600)
    .sort((a, b) => (a.seconds / a.miles) - (b.seconds / b.miles))[0];

  return {
    count: activities.length,
    totalMiles,
    weeklyMiles,
    longRun,
    recentLongRun,
    avgHr,
    observedPeakHr,
    hrWorkoutCount: maxHrActivities.length,
    peakHrWorkoutCount: peakHrActivities.length,
    bestEffort,
    latest: activities.at(-1),
    daysSinceLatest,
  };
}

function collectSettings() {
  const metrics = activityMetrics();
  const race = els.raceDistance.value;
  const fallbackWeeklyMileage = { "10k": 12, half: 16, marathon: 20 }[race];
  const fallbackLongRun = { "10k": 4, half: 6, marathon: 8 }[race];
  const birthdate = els.birthdate.value || state.settings.birthdate || "";
  return {
    runnerName: els.runnerName.value.trim() || "Runner",
    birthdate,
    race,
    goalSeconds: parseTimeToSeconds(els.goalTime.value),
    weeks: Math.max(1, Math.min(104, Number(els.planLength.value) || 16)),
    runsPerWeek: Number(els.runsPerWeek.value),
    startDate: els.planStart.value || todayIso(),
    weeklyMileage: metrics ? Math.max(1, Math.round(metrics.weeklyMiles)) : fallbackWeeklyMileage,
    longRun: metrics ? Math.max(1, Math.round(metrics.longRun * 10) / 10) : fallbackLongRun,
    age: calculateAge(birthdate),
    restingHr: Number(els.restingHr.value),
    maxHr: Number(els.maxHr.value) || null,
  };
}

function fitnessFromInputs(settings) {
  const raceMiles = raceDistances[settings.race];
  const goalPace = settings.goalSeconds / raceMiles;
  const metrics = activityMetrics();
  const bestEffortPrediction = metrics?.bestEffort
    ? riegelPredict(metrics.bestEffort.seconds, metrics.bestEffort.miles, raceMiles)
    : null;
  const inputPrediction = settings.goalSeconds * 1.18;
  const recentPrediction = bestEffortPrediction || inputPrediction;
  const mileageRatio = Math.min(1.25, settings.weeklyMileage / Math.max(10, raceMiles * 0.9));
  const longRunRatio = Math.min(1.25, settings.longRun / Math.max(4, raceMiles * 0.45));
  const readiness = Math.round(Math.max(35, Math.min(100, 100 - ((recentPrediction - settings.goalSeconds) / settings.goalSeconds) * 70 + (mileageRatio - 0.75) * 18 + (longRunRatio - 0.75) * 16)));

  return {
    raceMiles,
    goalPace,
    recentPrediction,
    readiness,
    metrics,
    easyPace: goalPace + 75,
    steadyPace: goalPace + 35,
    tempoPace: goalPace - 5,
    intervalPace: goalPace - 35,
  };
}

function heartRateModel(settings) {
  const metrics = activityMetrics();
  const ageMax = settings.age ? Math.round(208 - 0.7 * settings.age) : null;
  const observedPeak = metrics?.observedPeakHr || null;
  const observedEstimate = observedPeak ? Math.min(220, observedPeak + (observedPeak >= 170 ? 3 : 8)) : null;
  const maxCandidates = [settings.maxHr, observedEstimate, ageMax].filter(Boolean);
  const maxHr = maxCandidates.length ? Math.max(...maxCandidates) : 180;
  const restingHr = settings.restingHr || 55;
  const reserve = Math.max(70, maxHr - restingHr);
  const hasUsefulHistory = Boolean(metrics && metrics.hrWorkoutCount >= 5 && metrics.peakHrWorkoutCount >= 3 && observedPeak >= maxHr * 0.86);
  const needsTest = !settings.maxHr && !hasUsefulHistory;
  const source = settings.maxHr
    ? "your entered max HR"
    : hasUsefulHistory
      ? "your recent workout HR peaks"
      : settings.age
        ? "your age plus the HR seen in your workouts so far"
        : "a broad default because age/max HR are missing";

  return {
    maxHr,
    restingHr,
    reserve,
    observedPeak,
    hrWorkoutCount: metrics?.hrWorkoutCount || 0,
    peakHrWorkoutCount: metrics?.peakHrWorkoutCount || 0,
    needsTest,
    source,
    zones: {
      recovery: rangeFromReserve(restingHr, reserve, 0.58, 0.7),
      easy: rangeFromReserve(restingHr, reserve, 0.62, 0.76),
      steady: rangeFromReserve(restingHr, reserve, 0.72, 0.82),
      tempo: rangeFromReserve(restingHr, reserve, 0.8, 0.88),
      interval: rangeFromReserve(restingHr, reserve, 0.88, 0.94),
      long: rangeFromReserve(restingHr, reserve, 0.65, 0.8),
    },
  };
}

function rangeFromReserve(restingHr, reserve, low, high) {
  const lo = Math.round(restingHr + reserve * low);
  const hi = Math.round(restingHr + reserve * high);
  return `${lo}-${hi} bpm`;
}

function hrRange(settings, low, high) {
  const model = heartRateModel(settings);
  return rangeFromReserve(model.restingHr, model.reserve, low, high);
}

function workout(type, miles, detail, pace, hr, week, day, date, targetMode) {
  const paceTypes = ["Tempo", "Intervals", "Steady", "Race pace"];
  const mode = targetMode || (paceTypes.includes(type) ? "pace" : "hr");
  return {
    id: `${week}-${day}-${type.replace(/\W+/g, "-")}`,
    type,
    week,
    day,
    date,
    miles: Math.max(0, Math.round(miles * 10) / 10),
    detail,
    pace,
    hr,
    targetMode: mode,
    status: "planned",
  };
}

function buildPlan() {
  const settings = collectSettings();
  const fitness = fitnessFromInputs(settings);
  const hrModel = heartRateModel(settings);
  const performance = performanceAdjustment(settings, fitness);
  fitness.easyPace *= performance.pace || 1;
  fitness.steadyPace *= performance.pace || 1;
  fitness.tempoPace *= performance.pace || 1;
  fitness.intervalPace *= performance.pace || 1;
  const startMiles = Math.max(6, settings.weeklyMileage * performance.volume);
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

    const weekStartOffset = (week - 1) * 7;
    workouts.push(workout("Easy", easyMiles, "Run by heart rate. Keep this conversational. The goal is aerobic development without adding fatigue.", formatPace(fitness.easyPace), hrModel.zones.easy, week, 1, addDaysIso(settings.startDate, weekStartOffset)));
    if (week === 1 && hrModel.needsTest) {
      workouts.push(workout("HR field test", Math.min(4, Math.max(3, easyMiles)), "Warm up easily, then run 20 minutes hard but controlled. Use the average HR from the final 15 minutes to sharpen your zones.", "By feel", "Record final-15-minute average", week, 2, addDaysIso(settings.startDate, weekStartOffset + 2), "test"));
    } else {
      workouts.push(workout(quality, Math.min(8, weeklyMiles * 0.18), quality === "Tempo" ? "Warm up, then run controlled faster miles. You should finish knowing you could do a little more." : "Warm up, then run the faster repeats with enough recovery to keep your form clean.", formatPace(quality === "Tempo" ? fitness.tempoPace : fitness.intervalPace), quality === "Tempo" ? hrModel.zones.tempo : hrModel.zones.interval, week, 2, addDaysIso(settings.startDate, weekStartOffset + 2)));
    }

    if (settings.runsPerWeek >= 4) workouts.push(workout("Easy", easyMiles, "Run by heart rate. Keep this one relaxed and let the pace be whatever it needs to be.", formatPace(fitness.easyPace), hrModel.zones.easy, week, 3, addDaysIso(settings.startDate, weekStartOffset + 3)));
    if (settings.runsPerWeek >= 5) workouts.push(workout("Steady", Math.min(7, easyMiles + 1), "Run smoothly at a purposeful pace. This is not a race; it should build strength without draining the next workout.", formatPace(fitness.steadyPace), hrModel.zones.steady, week, 4, addDaysIso(settings.startDate, weekStartOffset + 4)));
    if (settings.runsPerWeek >= 6) workouts.push(workout("Recovery", Math.max(2, easyMiles - 1), "Run very easy. This workout exists to keep the habit and improve recovery, not to prove fitness.", formatPace(fitness.easyPace + 35), hrModel.zones.recovery, week, 5, addDaysIso(settings.startDate, weekStartOffset + 5)));

    workouts.push(workout("Long run", longRunMiles, "Run by heart rate. Stay controlled early, fuel if the run is long, and finish with good form.", formatPace(fitness.easyPace + 15), hrModel.zones.long, week, 6, addDaysIso(settings.startDate, weekStartOffset + 6)));
    plan.push({ week, weeklyMiles: Math.round(weeklyMiles), workouts });
  }

  state.settings = settings;
  state.plan = plan;
  state.performanceNote = performance.note;
  updateSummary(fitness);
  save();
  render();
}

function goalName(race) {
  return { "10k": "10K", half: "half marathon", marathon: "marathon" }[race] ?? race;
}

function readinessLabel(score) {
  if (score >= 85) return "You are close";
  if (score >= 70) return "This is realistic with focused training";
  if (score >= 55) return "This is possible, but the plan needs to be careful";
  return "This is a stretch goal right now";
}

function assessmentCards() {
  const settings = collectSettings();
  const fitness = fitnessFromInputs(settings);
  const metrics = fitness.metrics;
  const hrModel = heartRateModel(settings);
  const performance = performanceAdjustment(settings, fitness);
  const goalPace = formatPace(fitness.goalPace);
  const projectedGap = fitness.recentPrediction - settings.goalSeconds;
  const gapText = projectedGap <= 0
    ? `Your current projection is already about ${formatTime(Math.abs(projectedGap))} faster than the goal.`
    : `Your current projection is about ${formatTime(projectedGap)} slower than the goal.`;

  if (!metrics) {
    return [
      {
        tone: "watch",
        title: `${settings.runnerName}, I need your workout history`,
        text: `I can draft a ${settings.weeks}-week ${goalName(settings.race)} plan from your goal, but I cannot honestly assess your current fitness until you import recent workouts or connect Strava.`,
      },
      {
        tone: "watch",
        title: "Heart-rate zones are provisional",
        text: `Without recent HR data, I will use ${hrModel.source}. The plan will include a field test so the zones can be corrected from your own running.`,
      },
    ];
  }

  const volumeTone = metrics.weeklyMiles >= settings.weeklyMileage * 0.9 ? "good" : "watch";
  const longRunNeed = settings.race === "marathon" ? 16 : settings.race === "half" ? 10 : 6;
  const longRunTone = metrics.recentLongRun >= longRunNeed * 0.75 ? "good" : "watch";
  const recencyTone = metrics.daysSinceLatest <= 5 ? "good" : metrics.daysSinceLatest <= 12 ? "watch" : "risk";

  return [
    {
      tone: fitness.readiness >= 70 ? "good" : fitness.readiness >= 55 ? "watch" : "risk",
      title: `${settings.runnerName}, ${readinessLabel(fitness.readiness).toLowerCase()} (${fitness.readiness}% readiness)`,
      text: `For a ${goalName(settings.race)} goal of ${formatTime(settings.goalSeconds)}, you need roughly ${goalPace}. ${gapText}${settings.age ? ` Your age (${settings.age}) is used for provisional heart-rate ceilings and recovery guardrails.` : ""}`,
    },
    {
      tone: "good",
      title: "The strategy",
      text: `This is a ${settings.weeks}-week plan built around ${settings.runsPerWeek} runs per week. The main strategy is to build durable aerobic volume, protect easy days with heart-rate caps, use one quality workout most weeks for speed or threshold fitness, and grow the long run gradually so the race goal becomes specific rather than scary.`,
    },
    {
      tone: "watch",
      title: "How it adapts",
      text: `${performance.note} When you upload the newest workout, the app reviews pace, mileage, and heart rate, then recalculates future workouts rather than just checking whether you clicked done.`,
    },
    {
      tone: volumeTone,
      title: "Your current training base",
      text: `I see ${metrics.count} recent runs, about ${Math.round(metrics.weeklyMiles)} miles per week over the last 4 weeks, and ${Math.round(metrics.totalMiles)} miles in the six-month window.`,
    },
    {
      tone: longRunTone,
      title: "Endurance base",
      text: `Your longest recent run is ${metrics.longRun.toFixed(1)} miles. The plan will build from there rather than pretending you can jump straight to race-specific long runs.`,
    },
    {
      tone: recencyTone,
      title: "Latest workout",
      text: `Your newest imported workout is ${metrics.latest.miles.toFixed(2)} miles on ${metrics.latest.date}, averaging ${formatPace(metrics.latest.seconds / metrics.latest.miles)}${metrics.latest.avgHr ? ` at ${metrics.latest.avgHr} bpm` : ""}.`,
    },
    {
      tone: "good",
      title: "How the plan will target effort",
      text: "Easy, recovery, and long runs should be controlled by heart rate. Tempo, intervals, steady work, and race-pace sessions should be controlled by pace.",
    },
    {
      tone: hrModel.needsTest ? "watch" : "good",
      title: hrModel.needsTest ? "Heart-rate zones need a test" : "Heart-rate zones estimated from your data",
      text: hrModel.needsTest
        ? `I found ${hrModel.hrWorkoutCount} recent workouts with HR and a highest seen HR of ${hrModel.observedPeak || "not enough data"} bpm. I will put a short HR field test into week 1 so the zones get sharper. For now they are based on ${hrModel.source}.`
        : `I am using ${hrModel.source}. Current easy-run zone is ${hrModel.zones.easy}; long-run zone is ${hrModel.zones.long}.`,
    },
  ];
}

function performanceAdjustment(settings = collectSettings(), fitness = fitnessFromInputs(settings)) {
  const recent = recentActivities().slice(-6);
  if (!recent.length) {
    return { volume: 1, pace: 1, note: "No recent workout performance is loaded yet, so the plan is using conservative starting mileage." };
  }

  const hrModel = heartRateModel(settings);
  const latest = recent.at(-1);
  const latestPace = latest.seconds / Math.max(0.1, latest.miles);
  const avgHrRatio = latest.avgHr && hrModel.maxHr ? latest.avgHr / hrModel.maxHr : null;
  const paceVsEasy = latestPace / fitness.easyPace;
  const recentMileage = recent.reduce((sum, activity) => sum + activity.miles, 0);
  const targetMileage = Math.max(1, settings.weeklyMileage * 1.5);
  let volume = 1;
  let pace = 1;
  let note = `Latest workout reviewed: ${latest.miles.toFixed(2)} miles on ${latest.date} at ${formatPace(latestPace)}${latest.avgHr ? ` and ${latest.avgHr} bpm` : ""}.`;

  if (avgHrRatio && avgHrRatio > 0.86 && paceVsEasy > 1.02) {
    volume = 0.94;
    pace = 1.03;
    note += " That looks harder than planned, so future mileage is eased slightly and pace targets relax.";
  } else if (avgHrRatio && avgHrRatio < 0.76 && paceVsEasy < 0.98 && recentMileage >= targetMileage) {
    volume = 1.03;
    pace = 0.98;
    note += " That suggests you are absorbing the work well, so the next draft nudges volume and paces forward carefully.";
  } else if (recentMileage < targetMileage * 0.6) {
    volume = 0.92;
    note += " Recent mileage is light versus the plan, so the next draft protects you from a sudden jump.";
  } else {
    note += " That looks broadly in line with the plan, so future workouts stay steady.";
  }

  return {
    volume,
    pace,
    note,
  };
}

function updateSummary(fitness = fitnessFromInputs(collectSettings())) {
  els.readiness.textContent = `Readiness ${fitness.readiness}%`;
  els.projection.textContent = `Projected ${formatTime(fitness.recentPrediction)}`;
}

function renderAssessment() {
  els.assessment.replaceChildren(...assessmentCards().map((card) => {
    const article = document.createElement("article");
    article.className = `assessment-card ${card.tone}`;
    article.innerHTML = `<h3>${card.title}</h3><p>${card.text}</p>`;
    return article;
  }));
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
      <span>${activity.avgHr ? `${activity.avgHr} bpm avg${activity.maxHr ? ` / ${activity.maxHr} max` : ""}` : "HR unavailable"} • ${formatPace(activity.seconds / Math.max(0.1, activity.miles))}</span>
    `;
    return card;
  }));
}

function renderPlan() {
  if (!state.plan.length) {
    els.planGrid.innerHTML = "";
    return;
  }

  els.planNote.textContent = "Saved calendar plan. Import the newest workout when you come back, and future workouts adapt from performance.";
  els.planGrid.replaceChildren(...state.plan.map((week) => {
    const section = document.createElement("section");
    section.className = "week";
    const header = document.createElement("div");
    header.className = "week-header";
    const dates = week.workouts.length ? `${formatDate(week.workouts[0].date)}-${formatDate(week.workouts.at(-1).date)}` : "";
    header.innerHTML = `<span>Week ${week.week} <small>${dates}</small></span><span>${week.weeklyMiles} mi</span>`;
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
  const target = item.targetMode === "test"
    ? `Target: ${item.pace}`
    : item.targetMode === "pace"
    ? `Target pace: ${item.pace}`
    : `Target heart rate: ${item.hr}`;
  const secondary = item.targetMode === "test"
    ? `What to capture: ${item.hr}`
    : item.targetMode === "pace"
    ? `HR guardrail: ${item.hr}`
    : `Pace guardrail: ${item.pace}`;
  card.innerHTML = `
    <span class="tag">${item.status}</span>
    <h3>${formatDate(item.date)} • ${item.type} • ${item.miles} mi</h3>
    <p>${item.detail}</p>
    <p><strong>${target}</strong></p>
    <p>${secondary}</p>
  `;
  const actions = document.createElement("div");
  actions.className = "workout-actions";

  const skipped = document.createElement("button");
  skipped.type = "button";
  skipped.textContent = "Mark skipped";
  skipped.addEventListener("click", () => {
    item.status = "skipped";
    adaptFutureWorkouts();
    save();
    render();
  });

  actions.append(skipped);
  card.append(actions);
  return card;
}

function adaptFutureWorkouts() {
  const settings = state.settings?.race ? state.settings : collectSettings();
  const fitness = fitnessFromInputs(settings);
  const adjustment = performanceAdjustment(settings, fitness);
  state.plan.forEach((week) => {
    week.workouts.forEach((item) => {
      if (item.status !== "planned") return;
      item.miles = Math.round(item.miles * adjustment.volume * 10) / 10;
    });
  });
  state.performanceNote = adjustment.note;
}

function updateAfterLatestWorkout() {
  if (!state.activities.length) {
    state.importReport = "Import your recent workouts first, then I can reassess after the latest one.";
    render();
    return;
  }
  adaptFutureWorkouts();
  const latest = recentActivities().at(-1);
  state.importReport = latest
    ? `${state.performanceNote} Future planned workouts were adjusted.`
    : "No recent workout found in the six-month window.";
  save();
  render();
}

function render() {
  renderActivities();
  renderPlan();
  renderAssessment();
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
  const existingKeys = new Set(state.activities.map(activityKey));
  const newActivities = imported.filter((activity) => {
    const key = activityKey(activity);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  state.activities.push(...newActivities);
  state.activities.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  state.ignoredFiles += ignored;
  state.importReport = `Last import: ${files.length} selected, ${newActivities.length} new recent loaded, ${imported.length - newActivities.length} duplicates skipped, ${ignored} older ignored, ${failed} non-workout files skipped, ${files.length - supported.length} unsupported.`;
  if (state.plan.length) adaptFutureWorkouts();
  save();
  render();
}

function activityKey(activity) {
  return [activity.date, Math.round(activity.miles * 100), Math.round(activity.seconds), activity.name].join("|");
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
  const maxHr = Math.max(0, ...hrNodes.map((node) => Number(node.textContent || 0)).filter((value) => value < 255));
  const miles = lastDistance ? lastDistance / 1609.344 : estimateMilesFromGpx(doc);
  if (!miles || !seconds) return null;
  return { name, date: timeNodes[0]?.textContent?.slice(0, 10) || "", miles, seconds, avgHr: avgHr || null, maxHr: maxHr || null };
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
  const maxHr = session?.[17] || Math.max(0, ...heartRates) || null;
  const sport = session?.[5];

  if (!totalDistance || !seconds) return null;

  return {
    name,
    date: fitDate(startTimestamp),
    miles: totalDistance / 1609.344,
    seconds,
    avgHr,
    maxHr,
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
  const maxHrIndex = find("max heart", "max hr", "maximum heart", "peak heart", "peak hr");
  const dateIndex = find("date");
  const totals = rows.reduce((acc, row) => {
    acc.distance += Number(row[distanceIndex] || 0);
    acc.seconds += parseTimeToSeconds(row[timeIndex] || 0);
    acc.hr += Number(row[hrIndex] || 0);
    acc.hrCount += Number(row[hrIndex] || 0) ? 1 : 0;
    acc.maxHr = Math.max(acc.maxHr, Number(row[maxHrIndex] || 0));
    acc.date ||= row[dateIndex] || "";
    return acc;
  }, { distance: 0, seconds: 0, hr: 0, hrCount: 0, maxHr: 0, date: "" });
  const miles = totals.distance > 100 ? totals.distance / 1609.344 : totals.distance;
  if (!miles || !totals.seconds) return null;
  return { name, date: totals.date, miles, seconds: totals.seconds, avgHr: totals.hrCount ? Math.round(totals.hr / totals.hrCount) : null, maxHr: totals.maxHr || null };
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

function restoreSettingsToForm() {
  const settings = state.settings || {};
  els.runnerName.value = settings.runnerName || els.runnerName.value;
  els.birthdate.value = settings.birthdate || els.birthdate.value;
  els.raceDistance.value = settings.race || els.raceDistance.value;
  els.goalTime.value = settings.goalSeconds ? formatTime(settings.goalSeconds) : els.goalTime.value;
  els.planLength.value = settings.weeks || els.planLength.value;
  els.runsPerWeek.value = settings.runsPerWeek || els.runsPerWeek.value;
  els.planStart.value = settings.startDate || els.planStart.value || todayIso();
  els.restingHr.value = settings.restingHr || els.restingHr.value;
  els.maxHr.value = settings.maxHr || "";
}

els.generatePlan.addEventListener("click", buildPlan);
els.recalculate.addEventListener("click", () => {
  adaptFutureWorkouts();
  save();
  render();
});
els.updateAfterWorkout.addEventListener("click", updateAfterLatestWorkout);
els.stravaButton.addEventListener("click", () => {
  state.importReport = "Strava direct sync is the right next step, but it needs a tiny private backend so your Strava login token is not exposed on GitHub Pages. I added the setup notes in the repo.";
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
restoreSettingsToForm();
render();
