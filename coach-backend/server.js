import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

loadLocalEnv();

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8791);
const model = process.env.OPENAI_MODEL || "gpt-5-mini";
const apiKey = process.env.OPENAI_API_KEY;
const dailyLimitUsd = Number(process.env.AI_COACH_DAILY_LIMIT_USD || 0.5);
const monthlyLimitUsd = Number(process.env.AI_COACH_MONTHLY_LIMIT_USD || 5);
const maxOutputTokens = 1200;
const here = path.dirname(fileURLToPath(import.meta.url));
const usageLogPath = path.join(here, "usage-log.json");

function loadLocalEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(here, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

function modelPricing(selectedModel) {
  if (selectedModel.includes("gpt-5-mini")) return { inputPerMillion: 0.25, outputPerMillion: 2 };
  if (selectedModel.includes("gpt-5.2")) return { inputPerMillion: 1.75, outputPerMillion: 14 };
  return { inputPerMillion: Number(process.env.AI_COACH_INPUT_PER_MILLION_USD || 1), outputPerMillion: Number(process.env.AI_COACH_OUTPUT_PER_MILLION_USD || 4) };
}

function estimateTokensFromText(text) {
  return Math.ceil(String(text).length / 4);
}

function estimateCost({ inputTokens, outputTokens }) {
  const pricing = modelPricing(model);
  return (inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion;
}

function readUsageLog() {
  if (!fs.existsSync(usageLogPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(usageLogPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUsageLog(entries) {
  fs.writeFileSync(usageLogPath, `${JSON.stringify(entries, null, 2)}\n`);
}

function usageWindow(entries, prefix) {
  return entries
    .filter((entry) => entry.date?.startsWith(prefix))
    .reduce((sum, entry) => sum + Number(entry.costUsd || 0), 0);
}

function usageSummary(entries = readUsageLog()) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const month = now.toISOString().slice(0, 7);
  return {
    model,
    dailyLimitUsd,
    monthlyLimitUsd,
    todayUsd: usageWindow(entries, day),
    monthUsd: usageWindow(entries, month),
  };
}

function assertBudgetAllows(maxEstimatedCost) {
  const entries = readUsageLog();
  const summary = usageSummary(entries);
  if (summary.todayUsd + maxEstimatedCost > dailyLimitUsd) {
    return {
      ok: false,
      message: `AI coach daily budget would be exceeded. Today: $${summary.todayUsd.toFixed(4)}, estimated next call up to $${maxEstimatedCost.toFixed(4)}, limit: $${dailyLimitUsd.toFixed(2)}.`,
      usage: summary,
    };
  }
  if (summary.monthUsd + maxEstimatedCost > monthlyLimitUsd) {
    return {
      ok: false,
      message: `AI coach monthly budget would be exceeded. This month: $${summary.monthUsd.toFixed(4)}, estimated next call up to $${maxEstimatedCost.toFixed(4)}, limit: $${monthlyLimitUsd.toFixed(2)}.`,
      usage: summary,
    };
  }
  return { ok: true, entries, usage: summary };
}

function recordUsage(raw, estimatedInputTokens) {
  const usage = raw.usage || {};
  const inputTokens = usage.input_tokens || usage.prompt_tokens || estimatedInputTokens;
  const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
  const costUsd = estimateCost({ inputTokens, outputTokens });
  const entries = readUsageLog();
  entries.push({
    date: new Date().toISOString(),
    model,
    inputTokens,
    outputTokens,
    costUsd,
  });
  writeUsageLog(entries);
  return { costUsd, inputTokens, outputTokens, usage: usageSummary(entries) };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function coachInstructions() {
  return [
    "You are an elite endurance running coach.",
    "You are coaching one runner toward a race goal using Garmin workout data.",
    "Be candid but not dramatic. Explain what happened, what it means, and exactly how the plan should adapt.",
    "Use the completed workout, recent workouts, planned workout, heart rate, pace, distance, temperature, and hills.",
    "Do not over-penalize a workout that was hot or hilly.",
    "Return only valid JSON with keys: tone, postmortem, adjustment.",
    "tone must be one of: good, watch, risk.",
    "adjustment must include numeric volumeMultiplier and paceMultiplier plus a short summary.",
    "Keep volumeMultiplier between 0.85 and 1.08. Keep paceMultiplier between 0.94 and 1.08.",
    "A paceMultiplier above 1.00 means future pace targets get easier/slower. Below 1.00 means they get faster.",
  ].join(" ");
}

function planChatInstructions() {
  return [
    "You are an elite marathon coach collaborating with a runner inside a training-plan web app.",
    "The runner is trying to make the initial plan right before following it.",
    "Respond like a human coach: candid, practical, specific, and concise.",
    "Do not return an empty response.",
    "When the runner says the plan is too hard, reduce load intelligently without destroying the goal.",
    "Return only valid JSON with keys: reply, adjustment.",
    "adjustment must include volumeMultiplier, longRunMultiplier, qualityMultiplier, paceMultiplier, and summary.",
    "Use multipliers conservatively: volume 0.75-1.10, longRun 0.75-1.05, quality 0.75-1.05, pace 0.95-1.08.",
    "A paceMultiplier above 1.00 makes pace targets slower/easier.",
    "If no plan change is needed, return multipliers of 1.",
  ].join(" ");
}

async function askOpenAIJson({ instructions, payload, maxTokens = maxOutputTokens }) {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: "OPENAI_API_KEY is not set for the AI coach backend" },
    };
  }

  const input = JSON.stringify(payload, null, 2);
  const estimatedInputTokens = estimateTokensFromText(`${instructions}\n${input}`);
  const maxEstimatedCost = estimateCost({ inputTokens: estimatedInputTokens, outputTokens: maxTokens });
  const budget = assertBudgetAllows(maxEstimatedCost);
  if (!budget.ok) {
    return {
      status: 402,
      body: { error: budget.message, usage: budget.usage },
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input,
      max_output_tokens: maxTokens,
    }),
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      status: response.status,
      body: { error: raw.error?.message || "OpenAI request failed" },
    };
  }

  const spent = recordUsage(raw, estimatedInputTokens);
  const text = raw.output_text || raw.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("") || "";
  try {
    return { status: 200, body: { ...JSON.parse(text), usage: spent.usage, costUsd: spent.costUsd } };
  } catch {
    return {
      status: 200,
      body: { reply: text || "AI coach returned an empty response.", adjustment: {}, usage: spent.usage, costUsd: spent.costUsd },
    };
  }
}

async function askOpenAI(payload) {
  const result = await askOpenAIJson({
    instructions: coachInstructions(),
    payload: { task: "Analyze this runner workout and return JSON only.", ...payload },
  });
  if (result.status !== 200 || result.body.tone) return result;
  return {
    status: result.status,
    body: {
      tone: "watch",
      postmortem: result.body.reply || "AI coach returned an empty response.",
      adjustment: result.body.adjustment || {},
      usage: result.body.usage,
      costUsd: result.body.costUsd,
    },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/api/usage") {
    sendJson(res, 200, usageSummary());
    return;
  }

  if (req.method === "POST" && req.url === "/api/plan-chat") {
    const payload = await readJson(req);
    const result = await askOpenAIJson({
      instructions: planChatInstructions(),
      payload,
      maxTokens: 2200,
    });
    sendJson(res, result.status, result.body);
    return;
  }

  if (req.method !== "POST" || req.url !== "/api/coach") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const payload = await readJson(req);
    const result = await askOpenAI(payload);
    sendJson(res, result.status, result.body);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`AI coach backend listening on http://${host}:${port}`);
});
