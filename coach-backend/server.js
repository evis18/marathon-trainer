import http from "node:http";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8789);
const model = process.env.OPENAI_MODEL || "gpt-5.2";
const apiKey = process.env.OPENAI_API_KEY;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
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

async function askOpenAI(payload) {
  if (!apiKey) {
    return {
      status: 500,
      body: { error: "OPENAI_API_KEY is not set for the AI coach backend" },
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
      instructions: coachInstructions(),
      input: `Analyze this runner workout and return JSON only:\n${JSON.stringify(payload, null, 2)}`,
      max_output_tokens: 1200,
    }),
  });

  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      status: response.status,
      body: { error: raw.error?.message || "OpenAI request failed" },
    };
  }

  const text = raw.output_text || raw.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("") || "";
  try {
    return { status: 200, body: JSON.parse(text) };
  } catch {
    return {
      status: 200,
      body: {
        tone: "watch",
        postmortem: text || "AI coach returned an empty response.",
        adjustment: {
          volumeMultiplier: payload.ruleFallback?.volume || 1,
          paceMultiplier: payload.ruleFallback?.pace || 1,
          summary: "Used fallback adjustment because the AI response was not structured JSON.",
        },
      },
    };
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
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
