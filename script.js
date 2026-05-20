const raceDistances = {
  "5k": 3.1069,
  "10k": 6.2137,
  half: 13.1094,
  marathon: 26.2188,
};

const minRunMiles = raceDistances["5k"];
const minLongRunMiles = raceDistances["10k"];
const backupEndpoint = "http://localhost:8792/api/state";

const state = {
  plan: [],
  activities: [],
  settings: {},
  ignoredFiles: 0,
  importReport: "",
  performanceNote: "",
  localCacheLoaded: false,
  profileLocked: false,
  lastPostmortem: null,
  coachStatus: "AI coach not connected yet",
  backupStatus: "Local disk backup not checked yet",
  chatMessages: [],
};

const els = {
  workspace: document.querySelector("#workspace"),
  setupPanel: document.querySelector("#setup-panel"),
  profileSummary: document.querySelector("#profile-summary"),
  editSetup: document.querySelector("#edit-setup"),
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
  exportContext: document.querySelector("#export-context"),
  updateAfterWorkout: document.querySelector("#update-after-workout"),
  coachChat: document.querySelector("#coach-chat"),
  coachChatForm: document.querySelector("#coach-chat-form"),
  coachChatInput: document.querySelector("#coach-chat-input"),
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
      recovery: rangeFromReserve(restingHr, reserve, 0.6, 0.67),
      easy: rangeFromReserve(restingHr, reserve, 0.65, 0.72),
      steady: rangeFromReserve(restingHr, reserve, 0.74, 0.8),
      tempo: rangeFromReserve(restingHr, reserve, 0.82, 0.87),
      interval: rangeFromReserve(restingHr, reserve, 0.9, 0.94),
      long: rangeFromReserve(restingHr, reserve, 0.66, 0.74),
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

function intervalPrescription(week, settings, fitness) {
  const reps = Math.min(8, 4 + Math.floor((week - 1) / 3));
  const minutes = settings.race === "10k" ? 3 : settings.race === "half" ? 4 : 5;
  const recovery = minutes <= 3 ? "2:00 easy jog" : "2:30 easy jog";
  return {
    pace: formatPace(fitness.intervalPace),
    detail: `Warm up 12-15 minutes easy with 4 relaxed strides. Run ${reps} x ${minutes}:00 at ${formatPace(fitness.intervalPace)} with ${recovery} between reps. Cool down easy until the total reaches the assigned mileage. Keep the first two reps controlled; the last rep should be strong, not desperate.`,
  };
}

function tempoPrescription(week, fitness) {
  const blocks = week < 5 ? "2 x 8 minutes" : week < 10 ? "2 x 12 minutes" : "3 x 10 minutes";
  return `Warm up 12-15 minutes easy. Run ${blocks} at ${formatPace(fitness.tempoPace)} with 3:00 very easy jog between blocks. Cool down easy. This should feel controlled and sustainable, never like a time trial.`;
}

function longRunTarget(week, settings) {
  if (settings.race !== "marathon") {
    const cap = settings.race === "half" ? 12 : 7;
    const base = Math.max(minLongRunMiles, settings.longRun);
    const progress = week / Math.max(1, settings.weeks - 1);
    return Math.min(cap, base + (cap - base) * Math.sin(progress * Math.PI / 2));
  }

  const weeks = settings.weeks;
  const trainingWeeks = Math.max(1, weeks - 1);
  const taperStart = Math.max(1, weeks - 2);
  const currentLong = Math.max(minLongRunMiles, settings.longRun);
  if (week >= taperStart) return week === weeks ? 8 : 12;
  if (week === taperStart - 1) return 16;

  const peakLong = weeks >= 18 ? 21 : 20;
  const firstTwenty = weeks >= 18 ? Math.max(10, taperStart - 6) : Math.max(8, taperStart - 4);
  const secondTwenty = weeks >= 18 ? Math.max(firstTwenty + 3, taperStart - 3) : Math.max(firstTwenty + 2, taperStart - 2);
  if (weeks >= 16 && (week === firstTwenty || week === secondTwenty)) return peakLong;

  const progress = week / Math.max(1, taperStart - 3);
  let target = currentLong + (peakLong - currentLong) * Math.sin(Math.min(1, progress) * Math.PI / 2);

  if (week % 4 === 0) target *= 0.72;
  if (weeks >= 16) {
    if (week < firstTwenty) target = Math.min(target, 18.5);
    if (week > firstTwenty && week < secondTwenty) target = Math.min(target, 16);
    if (week > secondTwenty) target = Math.min(target, 16);
  }

  return Math.max(minLongRunMiles, Math.min(peakLong, target));
}

function weeklyMileageTarget(week, longRunMiles, settings, performance) {
  const racePeak = { "10k": 34, half: 44, marathon: settings.weeks >= 18 ? 58 : 54 }[settings.race];
  const currentBase = Math.max(
    settings.weeklyMileage,
    longRunMiles + minRunMiles * Math.max(1, settings.runsPerWeek - 1),
  );
  const progress = week / Math.max(1, settings.weeks - 2);
  const taperFactor = week > settings.weeks - 2 ? 0.55 : week > settings.weeks - 3 ? 0.72 : 1;
  const build = currentBase + (racePeak - currentBase) * Math.sin(Math.min(1, progress) * Math.PI / 2);
  const stepback = week % 4 === 0 && week < settings.weeks - 2 ? 0.82 : 1;
  const floor = longRunMiles + minRunMiles * Math.max(1, settings.runsPerWeek - 1);
  return Math.max(floor, build * stepback * taperFactor * (performance.volume || 1));
}

function distributeSupportMiles(weeklyMiles, longRunMiles, qualityMiles, settings) {
  const supportRuns = Math.max(1, settings.runsPerWeek - 2);
  const remaining = Math.max(minRunMiles * supportRuns, weeklyMiles - longRunMiles - qualityMiles);
  const easy = Math.max(minRunMiles, remaining / supportRuns);
  return {
    easy,
    steady: Math.max(minRunMiles, Math.min(10, easy + 1.5)),
    recovery: Math.max(minRunMiles, easy - 1),
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
  const plan = [];

  for (let week = 1; week <= settings.weeks; week += 1) {
    const longRunMiles = longRunTarget(week, settings);
    const weeklyMiles = weeklyMileageTarget(week, longRunMiles, settings, performance);
    const quality = week % 2 === 0 ? "Tempo" : "Intervals";
    const workouts = [];
    const qualityMiles = Math.max(minRunMiles, Math.min(settings.race === "marathon" ? 10 : 8, weeklyMiles * 0.18));
    const support = distributeSupportMiles(weeklyMiles, longRunMiles, qualityMiles, settings);

    const weekStartOffset = (week - 1) * 7;
    workouts.push(workout("Easy", support.easy, "Run by heart rate. Keep this conversational. The goal is aerobic development without adding fatigue.", formatPace(fitness.easyPace), hrModel.zones.easy, week, 1, addDaysIso(settings.startDate, weekStartOffset)));
    if (week === 1 && hrModel.needsTest) {
      workouts.push(workout("HR field test", Math.max(minRunMiles, Math.min(5, support.easy)), "Warm up easily, then run 20 minutes hard but controlled. Use the average HR from the final 15 minutes to sharpen your zones.", "By feel", "Record final-15-minute average", week, 2, addDaysIso(settings.startDate, weekStartOffset + 2), "test"));
    } else {
      const interval = intervalPrescription(week, settings, fitness);
      workouts.push(workout(quality, qualityMiles, quality === "Tempo" ? tempoPrescription(week, fitness) : interval.detail, formatPace(quality === "Tempo" ? fitness.tempoPace : fitness.intervalPace), quality === "Tempo" ? hrModel.zones.tempo : hrModel.zones.interval, week, 2, addDaysIso(settings.startDate, weekStartOffset + 2)));
    }

    if (settings.runsPerWeek >= 4) workouts.push(workout("Easy", support.easy, "Run by heart rate. Keep this one relaxed and let the pace be whatever it needs to be.", formatPace(fitness.easyPace), hrModel.zones.easy, week, 3, addDaysIso(settings.startDate, weekStartOffset + 3)));
    if (settings.runsPerWeek >= 5) workouts.push(workout("Steady", support.steady, "Run smoothly at a purposeful pace. This is not a race; it should build strength without draining the next workout.", formatPace(fitness.steadyPace), hrModel.zones.steady, week, 4, addDaysIso(settings.startDate, weekStartOffset + 4)));
    if (settings.runsPerWeek >= 6) workouts.push(workout("Recovery", support.recovery, "Run very easy. This workout exists to keep the habit and improve recovery, not to prove fitness.", formatPace(fitness.easyPace + 35), hrModel.zones.recovery, week, 5, addDaysIso(settings.startDate, weekStartOffset + 5)));

    const longDetail = longRunMiles >= 18
      ? "Run by heart rate. This is a marathon-specific rehearsal: fuel every 30-35 minutes, keep the first 75% easy, and finish steady only if you feel controlled."
      : "Run by heart rate. Stay controlled early, fuel if the run is long, and finish with good form.";
    workouts.push(workout("Long run", longRunMiles, longDetail, formatPace(fitness.easyPace + 15), hrModel.zones.long, week, 6, addDaysIso(settings.startDate, weekStartOffset + 6)));
    plan.push({ week, weeklyMiles: Math.round(weeklyMiles), workouts });
  }

  state.settings = settings;
  state.plan = plan;
  state.performanceNote = performance.note;
  state.profileLocked = true;
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
  const cards = [];

  if (state.lastPostmortem) {
    cards.push({
      tone: state.lastPostmortem.tone,
      title: state.lastPostmortem.source === "ai" ? "AI coach postmortem" : "Latest workout postmortem",
      text: state.lastPostmortem.text,
    });
  }

  if (!metrics) {
    return cards.concat([
      {
        tone: "watch",
        title: `${settings.runnerName}, I need your workout history`,
        text: `I can draft a ${settings.weeks}-week ${goalName(settings.race)} plan from your goal, but I cannot honestly assess your current fitness until you import recent Garmin workouts.`,
      },
      {
        tone: "watch",
        title: "Heart-rate zones are provisional",
        text: `Without recent HR data, I will use ${hrModel.source}. The plan will include a field test so the zones can be corrected from your own running.`,
      },
    ]);
  }

  const volumeTone = metrics.weeklyMiles >= settings.weeklyMileage * 0.9 ? "good" : "watch";
  const longRunNeed = settings.race === "marathon" ? 16 : settings.race === "half" ? 10 : 6;
  const longRunTone = metrics.recentLongRun >= longRunNeed * 0.75 ? "good" : "watch";
  const recencyTone = metrics.daysSinceLatest <= 5 ? "good" : metrics.daysSinceLatest <= 12 ? "watch" : "risk";

  return cards.concat([
    {
      tone: fitness.readiness >= 70 ? "good" : fitness.readiness >= 55 ? "watch" : "risk",
      title: `${settings.runnerName}, ${readinessLabel(fitness.readiness).toLowerCase()} (${fitness.readiness}% readiness)`,
      text: `For a ${goalName(settings.race)} goal of ${formatTime(settings.goalSeconds)}, you need roughly ${goalPace}. ${gapText}${settings.age ? ` Your age (${settings.age}) is used for provisional heart-rate ceilings and recovery guardrails.` : ""}`,
    },
    {
      tone: "good",
      title: "The strategy",
      text: `This is a ${settings.weeks}-week plan built around ${settings.runsPerWeek} runs per week. The strategy is now closer to an intermediate marathon plan: higher weekly volume, regular stepback weeks, marathon-pace or steady support work, and at least two 20-mile long runs for marathon builds of 16+ weeks.`,
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
  ]);
}

function performanceAdjustment(settings = collectSettings(), fitness = fitnessFromInputs(settings), completedActivity = null, plannedWorkout = null) {
  const recent = completedActivity ? recentActivities().concat(completedActivity).slice(-6) : recentActivities().slice(-6);
  if (!recent.length) {
    return { volume: 1, pace: 1, note: "No recent workout performance is loaded yet, so the plan is using conservative starting mileage." };
  }

  const hrModel = heartRateModel(settings);
  const latest = completedActivity || recent.at(-1);
  const latestPace = latest.seconds / Math.max(0.1, latest.miles);
  const avgHrRatio = latest.avgHr && hrModel.maxHr ? latest.avgHr / hrModel.maxHr : null;
  const paceVsEasy = latestPace / fitness.easyPace;
  const recentMileage = recent.reduce((sum, activity) => sum + activity.miles, 0);
  const targetMileage = Math.max(1, settings.weeklyMileage * 1.5);
  let volume = 1;
  let pace = 1;
  const context = environmentalContext(latest);
  let note = `Latest workout reviewed: ${latest.miles.toFixed(2)} miles on ${latest.date} at ${formatPace(latestPace)}${latest.avgHr ? ` and ${latest.avgHr} bpm` : ""}. ${context.summary}`;
  if (plannedWorkout) {
    const distanceRatio = latest.miles / Math.max(0.1, plannedWorkout.miles);
    note += ` Planned target was ${plannedWorkout.miles} miles of ${plannedWorkout.type}. You completed ${Math.round(distanceRatio * 100)}% of the assigned distance.`;
  }

  if (avgHrRatio && avgHrRatio > 0.86 && paceVsEasy > 1.02 && !context.difficult) {
    volume = 0.94;
    pace = 1.03;
    note += " That looks harder than planned, so future mileage is eased slightly and pace targets relax.";
  } else if (avgHrRatio && avgHrRatio > 0.86 && context.difficult) {
    volume = 0.98;
    pace = 1.01;
    note += " Effort was high, but heat or hills explain part of that cost, so I am only making a small adjustment rather than overreacting.";
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

function environmentalContext(activity) {
  const tempText = activity.avgTempF ? `${Math.round(activity.avgTempF)}F` : "temperature unavailable";
  const ascentPerMile = activity.ascentFeet ? activity.ascentFeet / Math.max(0.1, activity.miles) : 0;
  const hillText = activity.ascentFeet ? `${Math.round(activity.ascentFeet)} ft gained (${Math.round(ascentPerMile)} ft/mi)` : "hill data unavailable";
  const hot = activity.avgTempF && activity.avgTempF >= 70;
  const hilly = ascentPerMile >= 80;
  const flags = [];
  if (hot) flags.push("heat likely raised heart rate");
  if (hilly) flags.push("hills made the pace more expensive");
  return {
    difficult: Boolean(hot || hilly),
    summary: `Conditions considered: ${tempText}; ${hillText}.${flags.length ? ` ${flags.join("; ")}.` : ""}`,
  };
}

function postmortemFor(activity, workoutItem, adjustment) {
  const pace = activity.seconds / Math.max(0.1, activity.miles);
  const distanceRatio = activity.miles / Math.max(0.1, workoutItem.miles);
  const hrText = activity.avgHr ? `Average HR was ${activity.avgHr} bpm${activity.maxHr ? `, peaking at ${activity.maxHr} bpm` : ""}.` : "Heart-rate data was not available.";
  const context = environmentalContext(activity);
  const completionText = distanceRatio >= 0.95
    ? "You completed the assigned distance."
    : distanceRatio >= 0.75
      ? "You got most of the work done, but I am treating it as a partial completion."
      : "This was far short of the assignment, so I am protecting the next few workouts.";
  const tone = distanceRatio < 0.75 ? "risk" : adjustment.volume < 0.98 || adjustment.pace > 1.01 ? "watch" : "good";
  return {
    tone,
    source: "rules",
    text: `${workoutItem.type}: ${activity.miles.toFixed(2)} miles in ${formatTime(activity.seconds)} (${formatPace(pace)}). ${hrText} ${context.summary} ${completionText} ${adjustment.note}`,
  };
}

function coachPayload(activity, workoutItem, ruleAdjustment) {
  const settings = state.settings?.race ? state.settings : collectSettings();
  const fitness = fitnessFromInputs(settings);
  const hrModel = heartRateModel(settings);
  const recent = recentActivities().slice(-14).map((run) => ({
    date: run.date,
    miles: Number(run.miles.toFixed(2)),
    duration: formatTime(run.seconds),
    pace: formatPace(run.seconds / Math.max(0.1, run.miles)),
    avgHr: run.avgHr || null,
    maxHr: run.maxHr || null,
    ascentFeet: run.ascentFeet ? Math.round(run.ascentFeet) : null,
    avgTempF: run.avgTempF ? Math.round(run.avgTempF) : null,
  }));
  const futureWorkouts = state.plan.flatMap((week) => week.workouts)
    .filter((item) => item.status === "planned")
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      date: item.date,
      type: item.type,
      miles: item.miles,
      detail: item.detail,
      targetPace: item.pace,
      targetHr: item.hr,
    }));

  return {
    runner: {
      name: settings.runnerName,
      age: settings.age,
      raceGoal: goalName(settings.race),
      goalTime: formatTime(settings.goalSeconds),
      goalPace: formatPace(fitness.goalPace),
      runsPerWeek: settings.runsPerWeek,
      planWeeks: settings.weeks,
    },
    currentEstimate: {
      readiness: fitness.readiness,
      projectedRaceTime: formatTime(fitness.recentPrediction),
      hrZones: hrModel.zones,
    },
    plannedWorkout: {
      id: workoutItem.id,
      date: workoutItem.date,
      type: workoutItem.type,
      miles: workoutItem.miles,
      detail: workoutItem.detail,
      targetPace: workoutItem.pace,
      targetHr: workoutItem.hr,
    },
    completedWorkout: {
      date: activity.date,
      miles: Number(activity.miles.toFixed(2)),
      duration: formatTime(activity.seconds),
      pace: formatPace(activity.seconds / Math.max(0.1, activity.miles)),
      avgHr: activity.avgHr || null,
      maxHr: activity.maxHr || null,
      ascentFeet: activity.ascentFeet ? Math.round(activity.ascentFeet) : null,
      avgTempF: activity.avgTempF ? Math.round(activity.avgTempF) : null,
    },
    recentWorkouts: recent,
    futureWorkouts,
    ruleFallback: ruleAdjustment,
  };
}

async function askAiCoach(activity, workoutItem, ruleAdjustment) {
  const response = await fetch("http://localhost:8791/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(coachPayload(activity, workoutItem, ruleAdjustment)),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "AI coach backend unavailable");
  }
  return result;
}

function planChatContext(message) {
  const settings = state.settings?.race ? state.settings : collectSettings();
  const fitness = fitnessFromInputs(settings);
  const metrics = activityMetrics();
  const weeks = state.plan.map((week) => ({
    week: week.week,
    weeklyMiles: week.weeklyMiles,
    longRun: week.workouts.find((item) => item.type === "Long run")?.miles || null,
    workouts: week.workouts.map((item) => ({
      type: item.type,
      miles: item.miles,
      target: item.targetMode === "pace" ? item.pace : item.hr,
      status: item.status,
    })),
  }));

  return {
    message,
    runner: {
      name: settings.runnerName,
      age: settings.age,
      raceGoal: goalName(settings.race),
      goalTime: formatTime(settings.goalSeconds),
      goalPace: formatPace(fitness.goalPace),
      runsPerWeek: settings.runsPerWeek,
      planWeeks: settings.weeks,
    },
    currentFitness: {
      readiness: fitness.readiness,
      projectedRaceTime: formatTime(fitness.recentPrediction),
      weeklyMileage: settings.weeklyMileage,
      longestRecentRun: settings.longRun,
      recentRuns: metrics?.count || 0,
    },
    planSummary: {
      peakWeek: weeks.reduce((best, week) => week.weeklyMiles > best.weeklyMiles ? week : best, weeks[0] || { weeklyMiles: 0 }),
      longRuns: weeks.map((week) => ({ week: week.week, miles: week.longRun })),
      firstEightWeeks: weeks.slice(0, 8),
      lastEightWeeks: weeks.slice(-8),
    },
    chatHistory: state.chatMessages.slice(-8),
  };
}

async function askPlanCoach(message) {
  const response = await fetch("http://localhost:8791/api/plan-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(planChatContext(message)),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "AI plan coach unavailable");
  return normalizePlanChatResult(result);
}

function normalizePlanChatResult(result) {
  const adjustment = result.adjustment || {};
  return {
    reply: result.reply || "I could not produce a coaching response.",
    adjustment: {
      volumeMultiplier: Math.max(0.75, Math.min(1.1, Number(adjustment.volumeMultiplier ?? 1))),
      longRunMultiplier: Math.max(0.75, Math.min(1.05, Number(adjustment.longRunMultiplier ?? 1))),
      qualityMultiplier: Math.max(0.75, Math.min(1.05, Number(adjustment.qualityMultiplier ?? 1))),
      paceMultiplier: Math.max(0.95, Math.min(1.08, Number(adjustment.paceMultiplier ?? 1))),
      summary: adjustment.summary || "No plan adjustment applied.",
    },
    usage: result.usage,
    costUsd: result.costUsd,
  };
}

function applyPlanChatAdjustment(adjustment) {
  if (!state.plan.length) return;
  state.plan.forEach((week) => {
    week.workouts.forEach((item) => {
      if (item.status !== "planned") return;
      if (item.type === "Long run") {
        item.miles = Math.max(minLongRunMiles, Math.round(item.miles * adjustment.longRunMultiplier * 10) / 10);
      } else if (["Tempo", "Intervals", "Steady"].includes(item.type)) {
        item.miles = Math.max(minRunMiles, Math.round(item.miles * adjustment.qualityMultiplier * adjustment.volumeMultiplier * 10) / 10);
      } else {
        item.miles = Math.max(minRunMiles, Math.round(item.miles * adjustment.volumeMultiplier * 10) / 10);
      }
      if (item.targetMode === "pace" && item.pace?.includes("/mi")) {
        item.pace = formatPace(parseTimeToSeconds(item.pace.replace("/mi", "")) * adjustment.paceMultiplier);
      }
    });
    week.weeklyMiles = Math.round(week.workouts.reduce((sum, item) => sum + item.miles, 0));
  });
  state.performanceNote = adjustment.summary;
}

function normalizeCoachResult(result, fallbackAdjustment) {
  const volume = Number(result.adjustment?.volumeMultiplier ?? fallbackAdjustment.volume ?? 1);
  const pace = Number(result.adjustment?.paceMultiplier ?? fallbackAdjustment.pace ?? 1);
  return {
    adjustment: {
      volume: Math.max(0.85, Math.min(1.08, volume)),
      pace: Math.max(0.94, Math.min(1.08, pace)),
      note: result.adjustment?.summary || fallbackAdjustment.note,
    },
    postmortem: {
      tone: ["good", "watch", "risk"].includes(result.tone) ? result.tone : "watch",
      source: "ai",
      text: result.postmortem || fallbackAdjustment.note,
    },
  };
}

function updateSummary(fitness = fitnessFromInputs(collectSettings())) {
  els.readiness.textContent = `Readiness ${fitness.readiness}%`;
  els.projection.textContent = `Projected ${formatTime(fitness.recentPrediction)}`;
}

function profileSummaryText(settings = collectSettings()) {
  const pieces = [
    settings.runnerName,
    `${goalName(settings.race)} in ${formatTime(settings.goalSeconds)}`,
    `${settings.weeks} weeks`,
    `${settings.runsPerWeek} runs/week`,
    `starts ${formatDate(settings.startDate)}`,
  ];
  if (settings.age) pieces.push(`age ${settings.age}`);
  return pieces.filter(Boolean).join(" | ");
}

function persistProfileDraft() {
  state.settings = collectSettings();
  save();
  renderSetup();
}

function renderSetup() {
  const locked = Boolean(state.profileLocked && state.plan.length);
  els.workspace.classList.toggle("profile-locked", locked);
  els.setupPanel.classList.toggle("is-locked", locked);
  els.profileSummary.textContent = state.settings?.race
    ? profileSummaryText(state.settings)
    : "Set this up once. After that, work from the plan.";
}

function backupCard() {
  return {
    tone: state.backupStatus?.includes("saved") || state.backupStatus?.includes("restored") ? "good" : "watch",
    title: "Local backup",
    text: state.backupStatus || "Local disk backup has not been checked yet.",
  };
}

function renderAssessment() {
  const cards = assessmentCards().concat(backupCard());
  els.assessment.replaceChildren(...cards.map((card) => {
    const article = document.createElement("article");
    article.className = `assessment-card ${card.tone}`;
    article.innerHTML = `<h3>${card.title}</h3><p>${card.text}</p>`;
    return article;
  }));
}

function renderCoachChat() {
  if (!state.chatMessages.length) {
    els.coachChat.innerHTML = `
      <div class="chat-message coach">
        <strong>Coach</strong>
        <p>Tell me what feels wrong about the plan. For example: "this is too hard right now", "keep the 20 milers but lower weekday mileage", or "I want a more conservative first month."</p>
      </div>
    `;
    return;
  }

  els.coachChat.replaceChildren(...state.chatMessages.slice(-12).map((message) => {
    const card = document.createElement("article");
    card.className = `chat-message ${message.role}`;
    const adjustment = message.adjustment ? `
      <div class="chat-adjustments">
        <span>Volume x${message.adjustment.volumeMultiplier}</span>
        <span>Long run x${message.adjustment.longRunMultiplier}</span>
        <span>Quality x${message.adjustment.qualityMultiplier}</span>
        <span>Pace x${message.adjustment.paceMultiplier}</span>
      </div>
    ` : "";
    card.innerHTML = `<strong>${message.role === "user" ? "You" : "Coach"}</strong><p>${message.text}</p>${adjustment}`;
    return card;
  }));
  els.coachChat.scrollTop = els.coachChat.scrollHeight;
}

function renderActivities() {
  if (state.profileLocked && state.plan.length) {
    els.activityList.innerHTML = `
      <div class="activity-card compact">
        <strong>${state.activities.length} workouts available in the background</strong>
        <span>${state.importReport || "Use a workout card's completion button to attach the Garmin file for that run."}</span>
      </div>
    `;
    return;
  }

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

  refreshSavedPlanCoaching();
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

function refreshSavedPlanCoaching() {
  const settings = state.settings?.race ? state.settings : collectSettings();
  const fitness = fitnessFromInputs(settings);
  const hrModel = heartRateModel(settings);
  state.plan.forEach((week) => {
    week.workouts.forEach((item) => {
      if (item.status === "complete") return;
      if (item.type === "Long run" && item.miles < minLongRunMiles) item.miles = Math.round(minLongRunMiles * 10) / 10;
      if (item.type !== "Long run" && item.miles < minRunMiles) item.miles = Math.round(minRunMiles * 10) / 10;
      if (item.type === "Intervals" && !item.detail.includes(" x ")) {
        const interval = intervalPrescription(item.week || week.week, settings, fitness);
        item.detail = interval.detail;
        item.pace = interval.pace;
        item.hr = hrModel.zones.interval;
      }
      if (item.type === "Tempo" && !item.detail.includes(" x ")) {
        item.detail = tempoPrescription(item.week || week.week, fitness);
        item.pace = formatPace(fitness.tempoPace);
        item.hr = hrModel.zones.tempo;
      }
      if (item.targetMode === "hr" && item.type === "Easy") item.hr = hrModel.zones.easy;
      if (item.targetMode === "hr" && item.type === "Long run") item.hr = hrModel.zones.long;
      if (item.targetMode === "hr" && item.type === "Recovery") item.hr = hrModel.zones.recovery;
      if (item.type === "Steady") item.hr = hrModel.zones.steady;
    });
    week.weeklyMiles = Math.round(week.workouts.reduce((sum, item) => sum + item.miles, 0));
  });
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

  const completeLabel = document.createElement("label");
  completeLabel.className = "complete-upload";
  completeLabel.textContent = item.status === "complete" ? "Completed with Garmin file" : "Mark completed";
  const completeInput = document.createElement("input");
  completeInput.type = "file";
  completeInput.accept = ".fit,.tcx,.gpx,.xml,.csv";
  completeInput.disabled = item.status === "complete";
  completeInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      state.importReport = "A Garmin workout file is required before a workout can be marked complete.";
      render();
      return;
    }
    await completeWorkoutWithFile(item, file);
  });
  completeLabel.append(completeInput);

  const skipped = document.createElement("button");
  skipped.type = "button";
  skipped.textContent = "Mark skipped";
  skipped.addEventListener("click", () => {
    item.status = "skipped";
    adaptFutureWorkouts();
    save();
    render();
  });

  actions.append(completeLabel, skipped);
  card.append(actions);
  return card;
}

function workoutLine(item) {
  const target = item.targetMode === "pace" ? item.pace : item.hr;
  return `${item.date} | Week ${item.week} | ${item.type} | ${item.miles} mi | ${item.status} | target ${target} | ${item.detail}`;
}

function activityLine(activity) {
  const pace = formatPace(activity.seconds / Math.max(0.1, activity.miles));
  return `${activity.date} | ${activity.miles.toFixed(2)} mi | ${formatTime(activity.seconds)} | ${pace} | avg HR ${activity.avgHr || "n/a"} | max HR ${activity.maxHr || "n/a"} | ascent ${activity.ascentFeet ? Math.round(activity.ascentFeet) : "n/a"} ft | temp ${activity.avgTempF ? Math.round(activity.avgTempF) : "n/a"} F`;
}

function exportCoachContextText() {
  const settings = state.settings?.race ? state.settings : collectSettings();
  const fitness = fitnessFromInputs(settings);
  const hrModel = heartRateModel(settings);
  const metrics = activityMetrics();
  const recent = recentActivities().slice(-20);
  const future = state.plan.flatMap((week) => week.workouts).filter((item) => item.status === "planned").slice(0, 24);
  const completed = state.plan.flatMap((week) => week.workouts).filter((item) => item.status === "complete").slice(-10);

  return [
    "# Marathon Trainer Coach Context",
    "",
    "Use this context to discuss, critique, and adjust my training plan. Be candid and specific, like an elite running coach.",
    "",
    "## Runner And Goal",
    `Name: ${settings.runnerName}`,
    `Age: ${settings.age || "unknown"}`,
    `Race goal: ${goalName(settings.race)} in ${formatTime(settings.goalSeconds)}`,
    `Goal pace: ${formatPace(fitness.goalPace)}`,
    `Plan length: ${settings.weeks} weeks`,
    `Runs per week: ${settings.runsPerWeek}`,
    `Plan start: ${settings.startDate}`,
    "",
    "## Current Assessment",
    `Readiness: ${fitness.readiness}%`,
    `Projected race time: ${formatTime(fitness.recentPrediction)}`,
    metrics ? `Recent training: ${metrics.count} runs, ${Math.round(metrics.weeklyMiles)} mi/week over last 4 weeks, ${Math.round(metrics.totalMiles)} miles in six-month window, longest run ${metrics.longRun.toFixed(1)} mi.` : "Recent training: no workout history loaded.",
    `Heart-rate zones: recovery ${hrModel.zones.recovery}, easy ${hrModel.zones.easy}, long ${hrModel.zones.long}, steady ${hrModel.zones.steady}, tempo ${hrModel.zones.tempo}, interval ${hrModel.zones.interval}.`,
    `AI coach status: ${state.coachStatus || "unknown"}`,
    `Local backup status: ${state.backupStatus || "unknown"}`,
    "",
    "## Latest Postmortem",
    state.lastPostmortem ? `${state.lastPostmortem.source || "local"} / ${state.lastPostmortem.tone}: ${state.lastPostmortem.text}` : "No completed-workout postmortem yet.",
    "",
    "## Recent Workouts",
    recent.length ? recent.map(activityLine).join("\n") : "No recent workouts loaded.",
    "",
    "## Completed Plan Workouts",
    completed.length ? completed.map(workoutLine).join("\n") : "No plan workouts marked complete yet.",
    "",
    "## Upcoming Planned Workouts",
    future.length ? future.map(workoutLine).join("\n") : "No upcoming planned workouts.",
    "",
    "## What I Want From You",
    "Help me understand whether the plan is appropriate, what to adjust next, and what to watch for based on my recent performance.",
  ].join("\n");
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportCoachContext() {
  const text = exportCoachContextText();
  try {
    await navigator.clipboard.writeText(text);
    state.importReport = "Coach context copied to clipboard and downloaded as a text file.";
  } catch {
    state.importReport = "Coach context downloaded as a text file.";
  }
  downloadTextFile(`marathon-coach-context-${todayIso()}.md`, text);
  save();
  render();
}

async function completeWorkoutWithFile(item, file) {
  let activity = null;
  try {
    activity = await parseActivity(file);
  } catch {
    activity = null;
  }
  if (!activity) {
    state.importReport = "I could not read that workout file, so I did not mark the workout complete.";
    save();
    render();
    return;
  }

  mergeActivities([activity]);
  item.status = "complete";
  item.completedActivityKey = activityKey(activity);
  const settings = state.settings?.race ? state.settings : collectSettings();
  const fitness = fitnessFromInputs(settings);
  let adjustment = performanceAdjustment(settings, fitness, activity, item);
  state.lastPostmortem = postmortemFor(activity, item, adjustment);
  state.coachStatus = "Using local fallback coach rules.";
  try {
    state.importReport = "Asking AI coach for workout analysis...";
    render();
    const ai = normalizeCoachResult(await askAiCoach(activity, item, adjustment), adjustment);
    adjustment = ai.adjustment;
    state.lastPostmortem = ai.postmortem;
    state.coachStatus = "AI coach used ChatGPT for the latest postmortem.";
  } catch (error) {
    state.coachStatus = `AI coach unavailable: ${error.message}. Used local fallback analysis.`;
  }
  state.performanceNote = adjustment.note;
  adaptFutureWorkouts(adjustment);
  state.importReport = `Workout completed from Garmin file. ${state.coachStatus}`;
  save();
  render();
}

function adaptFutureWorkouts(existingAdjustment = null) {
  const settings = state.settings?.race ? state.settings : collectSettings();
  const fitness = fitnessFromInputs(settings);
  const adjustment = existingAdjustment || performanceAdjustment(settings, fitness);
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
  renderSetup();
  renderActivities();
  renderPlan();
  renderAssessment();
  renderCoachChat();
  updateSummary();
}

function mergeActivities(activities) {
  const existingKeys = new Set(state.activities.map(activityKey));
  const newActivities = activities.filter((activity) => {
    if (!activity || !isWithinLastSixMonths(activity.date)) return false;
    const key = activityKey(activity);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  state.activities.push(...newActivities);
  state.activities.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return newActivities.length;
}

async function loadLocalWorkoutCache() {
  try {
    const response = await fetch(`local-workouts.json?cache=${Date.now()}`);
    if (!response.ok) return;
    const payload = await response.json();
    const cacheCount = payload.activities?.length || 0;
    const cachedKeys = new Set((payload.activities || []).map(activityKey));
    const alreadyHasCache = cacheCount > 0 && state.activities.some((activity) => cachedKeys.has(activityKey(activity)));
    if (state.localCacheLoaded && alreadyHasCache) {
      state.importReport ||= `Local workout cache available: ${cacheCount} recent workouts.`;
      return;
    }
    const loaded = mergeActivities(payload.activities || []);
    state.localCacheLoaded = true;
    state.importReport = loaded
      ? `Local workout cache loaded: ${loaded} recent workouts added.`
      : `Local workout cache found: ${cacheCount} recent workouts already available.`;
    if (state.plan.length) adaptFutureWorkouts();
    save();
  } catch {
    state.localCacheLoaded = false;
  }
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
  const newCount = mergeActivities(imported);
  state.ignoredFiles += ignored;
  state.importReport = `Last import: ${files.length} selected, ${newCount} new recent loaded, ${imported.length - newCount} duplicates skipped, ${ignored} older ignored, ${failed} non-workout files skipped, ${files.length - supported.length} unsupported.`;
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
  const altitudeNodes = [...doc.querySelectorAll("AltitudeMeters, ele")];
  const timeNodes = [...doc.querySelectorAll("Time, time")];
  const hrNodes = [...doc.querySelectorAll("HeartRateBpm Value, hr")];
  const lastDistance = Number(distanceNodes.at(-1)?.textContent || 0);
  const firstTime = Date.parse(timeNodes[0]?.textContent || "");
  const lastTime = Date.parse(timeNodes.at(-1)?.textContent || "");
  const seconds = Number.isFinite(firstTime) && Number.isFinite(lastTime) ? Math.max(1, (lastTime - firstTime) / 1000) : 0;
  const avgHr = Math.round(hrNodes.reduce((sum, node) => sum + Number(node.textContent || 0), 0) / Math.max(1, hrNodes.length));
  const maxHr = Math.max(0, ...hrNodes.map((node) => Number(node.textContent || 0)).filter((value) => value < 255));
  const elevations = altitudeNodes.map((node) => Number(node.textContent || 0)).filter((value) => Number.isFinite(value));
  const miles = lastDistance ? lastDistance / 1609.344 : estimateMilesFromGpx(doc);
  if (!miles || !seconds) return null;
  return { name, date: timeNodes[0]?.textContent?.slice(0, 10) || "", miles, seconds, avgHr: avgHr || null, maxHr: maxHr || null, ascentFeet: calculateAscentFeet(elevations) };
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
  const elevations = records.map((record) => fitAltitude(record[78] ?? record[2])).filter((value) => value !== null);
  const ascentFeet = session?.[22] ? session[22] * 3.28084 : calculateAscentFeet(elevations);
  const temperatures = records.map((record) => record[13]).filter((value) => Number.isFinite(value) && value > -30 && value < 60);
  const avgTempC = session?.[14] ?? (temperatures.length ? temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length : null);
  const avgTempF = avgTempC === null ? null : avgTempC * 9 / 5 + 32;
  const sport = session?.[5];

  if (!totalDistance || !seconds) return null;

  return {
    name,
    date: fitDate(startTimestamp),
    miles: totalDistance / 1609.344,
    seconds,
    avgHr,
    maxHr,
    ascentFeet,
    avgTempF,
    sport,
  };
}

function fitAltitude(raw) {
  if (!Number.isFinite(raw) || raw === 0xffff) return null;
  return raw / 5 - 500;
}

function calculateAscentFeet(elevations) {
  if (!elevations.length) return null;
  let ascentMeters = 0;
  for (let index = 1; index < elevations.length; index += 1) {
    const gain = elevations[index] - elevations[index - 1];
    if (gain > 1) ascentMeters += gain;
  }
  return ascentMeters ? ascentMeters * 3.28084 : null;
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

function backupStateSoon() {
  clearTimeout(backupStateSoon.timer);
  backupStateSoon.timer = setTimeout(() => {
    fetch(backupEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("backup server unavailable");
        state.backupStatus = `Disk backup saved at ${new Date().toLocaleTimeString()}.`;
        localStorage.setItem("marathon-trainer-state", JSON.stringify(state));
      })
      .catch(() => {
        state.backupStatus = "Disk backup is not running. Browser storage is still saved.";
        localStorage.setItem("marathon-trainer-state", JSON.stringify(state));
      });
  }, 300);
}

function save(options = {}) {
  localStorage.setItem("marathon-trainer-state", JSON.stringify(state));
  if (!options.skipBackup) backupStateSoon();
}

function load() {
  const saved = localStorage.getItem("marathon-trainer-state");
  if (!saved) return;
  try {
    const savedState = JSON.parse(saved);
    Object.assign(state, savedState);
    if (state.plan.length && state.settings?.race && !("profileLocked" in savedState)) {
      state.profileLocked = true;
    }
  } catch {
    localStorage.removeItem("marathon-trainer-state");
  }
}

async function restoreFromDiskBackupIfNeeded() {
  if (state.plan.length || state.activities.length) return false;
  try {
    const response = await fetch(backupEndpoint);
    if (!response.ok) {
      state.backupStatus = "No disk backup found yet. Browser storage is active.";
      return false;
    }
    const payload = await response.json();
    if (!payload.state) return false;
    Object.assign(state, payload.state);
    state.backupStatus = `Restored from disk backup saved ${payload.savedAt ? new Date(payload.savedAt).toLocaleString() : "previously"}.`;
    save({ skipBackup: true });
    return true;
  } catch {
    state.backupStatus = "Disk backup server is not running. Browser storage is active.";
    return false;
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

const profileInputs = [
  els.runnerName,
  els.birthdate,
  els.raceDistance,
  els.goalTime,
  els.planLength,
  els.runsPerWeek,
  els.planStart,
  els.restingHr,
  els.maxHr,
];

profileInputs.forEach((input) => {
  input.addEventListener("change", persistProfileDraft);
  input.addEventListener("blur", persistProfileDraft);
});

els.generatePlan.addEventListener("click", buildPlan);
els.editSetup.addEventListener("click", () => {
  state.profileLocked = false;
  save();
  renderSetup();
});
els.recalculate.addEventListener("click", () => {
  adaptFutureWorkouts();
  save();
  render();
});
els.exportContext.addEventListener("click", exportCoachContext);
els.coachChatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = els.coachChatInput.value.trim();
  if (!message) return;
  els.coachChatInput.value = "";
  state.chatMessages.push({ role: "user", text: message, date: new Date().toISOString() });
  state.chatMessages.push({ role: "coach", text: "Thinking through the plan...", date: new Date().toISOString() });
  save();
  render();

  try {
    const result = await askPlanCoach(message);
    state.chatMessages.pop();
    state.chatMessages.push({
      role: "coach",
      text: result.reply,
      adjustment: result.adjustment,
      date: new Date().toISOString(),
    });
    applyPlanChatAdjustment(result.adjustment);
    state.coachStatus = `AI plan coach adjusted the plan. ${result.costUsd ? `Cost: $${result.costUsd.toFixed(4)}.` : ""}`;
  } catch (error) {
    state.chatMessages.pop();
    state.chatMessages.push({
      role: "coach",
      text: `I could not reach the AI coach backend, so I did not change the plan. ${error.message}`,
      date: new Date().toISOString(),
    });
    state.coachStatus = `AI plan coach unavailable: ${error.message}`;
  }
  save();
  render();
});
els.updateAfterWorkout.addEventListener("click", updateAfterLatestWorkout);
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
restoreFromDiskBackupIfNeeded()
  .then(() => {
    restoreSettingsToForm();
    return loadLocalWorkoutCache();
  })
  .then(render);
