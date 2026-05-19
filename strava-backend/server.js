import http from "node:http";

const port = Number(process.env.PORT || 8787);
const clientId = process.env.STRAVA_CLIENT_ID;
const clientSecret = process.env.STRAVA_CLIENT_SECRET;
const redirectUri = process.env.STRAVA_REDIRECT_URI || `http://localhost:${port}/auth/strava/callback`;
const frontendOrigin = process.env.FRONTEND_ORIGIN || "*";

let tokenSet = null;

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": frontendOrigin,
  });
  res.end(JSON.stringify(body));
}

function requireConfig(res) {
  if (clientId && clientSecret) return true;
  sendJson(res, 500, {
    error: "Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET",
  });
  return false;
}

async function exchangeCode(code) {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error(`Strava token exchange failed: ${response.status}`);
  return response.json();
}

async function refreshTokenIfNeeded() {
  if (!tokenSet) return null;
  const expiresSoon = tokenSet.expires_at * 1000 < Date.now() + 120000;
  if (!expiresSoon) return tokenSet.access_token;

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenSet.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Strava token refresh failed: ${response.status}`);
  tokenSet = await response.json();
  return tokenSet.access_token;
}

async function loadActivities() {
  const accessToken = await refreshTokenIfNeeded();
  if (!accessToken) return null;
  const sixMonthsAgo = Math.floor((Date.now() - 183 * 86400000) / 1000);
  const response = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${sixMonthsAgo}&per_page=100`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Strava activities request failed: ${response.status}`);
  return response.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/auth/strava") {
      if (!requireConfig(res)) return;
      const authUrl = new URL("https://www.strava.com/oauth/authorize");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("approval_prompt", "auto");
      authUrl.searchParams.set("scope", "activity:read_all");
      res.writeHead(302, { location: authUrl.toString() });
      res.end();
      return;
    }

    if (url.pathname === "/auth/strava/callback") {
      if (!requireConfig(res)) return;
      const code = url.searchParams.get("code");
      if (!code) {
        sendJson(res, 400, { error: "Missing Strava authorization code" });
        return;
      }
      tokenSet = await exchangeCode(code);
      sendJson(res, 200, { ok: true, message: "Strava connected. You can close this tab." });
      return;
    }

    if (url.pathname === "/api/strava/activities") {
      if (!requireConfig(res)) return;
      const activities = await loadActivities();
      if (!activities) {
        sendJson(res, 401, { error: "Strava is not connected yet. Visit /auth/strava first." });
        return;
      }
      sendJson(res, 200, activities);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Strava backend listening on http://localhost:${port}`);
});
