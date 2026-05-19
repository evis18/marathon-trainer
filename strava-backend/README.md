# Strava Backend Starter

This folder is the safe path for direct Strava sync.

GitHub Pages can show the training app, but it cannot safely store a Strava client secret or refresh token. A small backend needs to handle the Strava login, keep tokens private, and expose only the activity data the app needs.

## Environment

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI`, for example `http://localhost:8787/auth/strava/callback`
- `FRONTEND_ORIGIN`, for example `https://evis18.github.io`

## Local start

```sh
npm install
npm start
```

Then open:

```text
http://localhost:8787/auth/strava
```

After login, the app can call:

```text
http://localhost:8787/api/strava/activities
```

This starter keeps tokens in memory so it is useful for local testing. Before using it for real deployment, store the refresh token somewhere private and persistent.
