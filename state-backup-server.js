import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.BACKUP_PORT || 8792);
const here = path.dirname(fileURLToPath(import.meta.url));
const backupPath = path.join(here, "state-backup.json");

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function backupEnvelope(state) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    state,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/api/state") {
    if (!fs.existsSync(backupPath)) {
      sendJson(res, 404, { error: "No backup exists yet" });
      return;
    }
    sendJson(res, 200, JSON.parse(fs.readFileSync(backupPath, "utf8")));
    return;
  }

  if (req.method === "POST" && req.url === "/api/state") {
    const body = await readJson(req);
    if (!body || typeof body !== "object" || !body.state) {
      sendJson(res, 400, { error: "Missing state" });
      return;
    }
    fs.writeFileSync(backupPath, `${JSON.stringify(backupEnvelope(body.state), null, 2)}\n`);
    sendJson(res, 200, { ok: true, savedAt: new Date().toISOString() });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`State backup server listening on http://${host}:${port}`);
});
