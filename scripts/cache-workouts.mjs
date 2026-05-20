import fs from "node:fs/promises";
import path from "node:path";

const defaultSource = "/Users/evis/Downloads/5ce7d25b-7250-42f5-b7fb-5ec0b3e9dd27_1/DI_CONNECT/DI-Connect-Uploaded-Files";
const source = process.argv[2] || defaultSource;
const output = new URL("../local-workouts.json", import.meta.url);
const supported = /\.(fit|tcx|gpx|xml|csv)$/i;

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (supported.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseTimeToSeconds(value) {
  const parts = String(value).trim().split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return Number(value) || 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
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
  const distances = [...text.matchAll(/<DistanceMeters>([^<]+)<\/DistanceMeters>/gi)].map((match) => Number(match[1]));
  const times = [...text.matchAll(/<(?:Time|time)>([^<]+)<\/(?:Time|time)>/gi)].map((match) => match[1]);
  const heartRates = [...text.matchAll(/<(?:Value|hr)>(\d+)<\/(?:Value|hr)>/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value > 20 && value < 255);
  const lastDistance = distances.at(-1) || 0;
  const firstTime = Date.parse(times[0] || "");
  const lastTime = Date.parse(times.at(-1) || "");
  const seconds = Number.isFinite(firstTime) && Number.isFinite(lastTime) ? Math.max(1, (lastTime - firstTime) / 1000) : 0;
  const miles = lastDistance ? lastDistance / 1609.344 : 0;
  if (!miles || !seconds) return null;
  return {
    name,
    date: times[0]?.slice(0, 10) || "",
    miles,
    seconds,
    avgHr: heartRates.length ? Math.round(heartRates.reduce((sum, value) => sum + value, 0) / heartRates.length) : null,
    maxHr: heartRates.length ? Math.max(...heartRates) : null,
  };
}

function parseFitActivity(name, buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
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
      const architecture = view.getUint8(offset + 1);
      const littleEndian = architecture === 0;
      const globalMessage = littleEndian ? view.getUint16(offset + 2, true) : view.getUint16(offset + 2, false);
      const fieldCount = view.getUint8(offset + 4);
      offset += 5;
      const fields = [];
      for (let index = 0; index < fieldCount; index += 1) {
        fields.push({
          fieldNum: view.getUint8(offset),
          size: view.getUint8(offset + 1),
          baseType: view.getUint8(offset + 2),
        });
        offset += 3;
      }
      const developerFields = [];
      if (hasDeveloperFields) {
        const developerFieldCount = view.getUint8(offset);
        offset += 1;
        for (let index = 0; index < developerFieldCount; index += 1) {
          developerFields.push({ size: view.getUint8(offset + 1) });
          offset += 3;
        }
      }
      definitions.set(localType, { littleEndian, globalMessage, fields, developerFields });
      continue;
    }

    const definition = definitions.get(localType);
    if (!definition) break;
    const values = {};
    for (const field of definition.fields) {
      values[field.fieldNum] = readFitValue(view, offset, field, definition.littleEndian);
      offset += field.size;
    }
    for (const field of definition.developerFields) offset += field.size;
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
  if (!totalDistance || !seconds) return null;
  return { name, date: fitDate(startTimestamp), miles: totalDistance / 1609.344, seconds, avgHr, maxHr };
}

function readFitValue(view, offset, field, littleEndian) {
  if (field.size > fitBaseTypeSize(field.baseType)) {
    const values = [];
    for (let index = 0; index < field.size; index += fitBaseTypeSize(field.baseType)) {
      values.push(readFitScalar(view, offset + index, field.baseType, littleEndian));
    }
    return values.find((value) => value !== null) ?? null;
  }
  return readFitScalar(view, offset, field.baseType, littleEndian);
}

function fitBaseTypeSize(baseType) {
  const normalized = baseType & 0x1f;
  return {
    0x00: 1, 0x01: 1, 0x02: 1, 0x07: 1, 0x0a: 1, 0x83: 2, 0x84: 2,
    0x85: 4, 0x86: 4, 0x88: 4, 0x89: 8, 0x8b: 2, 0x8c: 2, 0x8d: 4, 0x8e: 4,
  }[baseType] ?? { 0x03: 2, 0x04: 2, 0x05: 4, 0x06: 4, 0x08: 4, 0x09: 8, 0x0b: 2, 0x0c: 2, 0x0d: 4, 0x0e: 4 }[normalized] ?? 1;
}

function readFitScalar(view, offset, baseType, littleEndian) {
  if (offset >= view.byteLength) return null;
  switch (baseType & 0x1f) {
    case 0x00:
    case 0x02:
    case 0x0a:
    case 0x0d:
      return view.getUint8(offset);
    case 0x01:
      return view.getInt8(offset);
    case 0x03:
      return view.getInt16(offset, littleEndian);
    case 0x04:
    case 0x0b:
      return view.getUint16(offset, littleEndian);
    case 0x05:
      return view.getInt32(offset, littleEndian);
    case 0x06:
    case 0x0c:
      return view.getUint32(offset, littleEndian);
    case 0x08:
      return view.getFloat32(offset, littleEndian);
    case 0x09:
      return view.getFloat64(offset, littleEndian);
    default:
      return view.getUint8(offset);
  }
}

function fitDate(timestamp) {
  if (!timestamp) return "";
  const garminEpoch = Date.UTC(1989, 11, 31);
  return new Date(garminEpoch + timestamp * 1000).toISOString().slice(0, 10);
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
  if (distanceIndex < 0 || timeIndex < 0) return null;
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

async function parseFile(filePath) {
  const name = path.basename(filePath);
  const lower = name.toLowerCase();
  if (lower.endsWith(".fit")) return parseFitActivity(name, await fs.readFile(filePath));
  const text = await fs.readFile(filePath, "utf8");
  if (lower.endsWith(".csv")) return parseCsvActivity(name, text);
  return parseXmlActivity(name, text);
}

const files = await walk(source);
const activities = [];
let older = 0;
let failed = 0;
for (const file of files) {
  try {
    const activity = await parseFile(file);
    if (!activity) {
      failed += 1;
    } else if (isWithinLastSixMonths(activity.date)) {
      activities.push(activity);
    } else {
      older += 1;
    }
  } catch {
    failed += 1;
  }
}

const byKey = new Map();
for (const activity of activities.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  const key = [activity.date, Math.round(activity.miles * 100), Math.round(activity.seconds), activity.name].join("|");
  byKey.set(key, activity);
}

const payload = {
  generatedAt: new Date().toISOString(),
  source,
  selected: files.length,
  loaded: byKey.size,
  older,
  skipped: failed,
  activities: [...byKey.values()],
};

await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Cached ${payload.loaded} recent workouts to ${output.pathname}`);
console.log(`${payload.older} older files ignored; ${payload.skipped} non-workout/unreadable files skipped.`);
