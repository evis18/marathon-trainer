# Marathon Trainer

A static browser app for goal-based race training plans.

Version one supports:

- Race goals for 10K, half marathon, and marathon
- Goal time and plan length inputs
- Age and runs-per-week inputs
- Current fitness inputs before generating the plan
- Fitness assessment from recent workout history
- Heart-rate zone estimates from imported workout HR data, with an HR field test added when the data is not strong enough
- Adaptive plan recalculation after completed or skipped workouts
- Garmin file imports for FIT, TCX, GPX/XML, and CSV activity exports
- Automatic filtering to the last six months of workouts

For an initial test, select a batch of local Garmin `.fit` files. The app will ignore files older than six months.

## Strava direct sync

Direct Strava sync is not something a static GitHub Pages page can safely do by itself. Strava uses OAuth, which requires a client secret and access tokens. Those must live in a small backend, not in public browser code.

The `strava-backend/` folder contains a starter backend plan for the next step:

1. Create a Strava API app.
2. Put `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_REDIRECT_URI` in the backend environment.
3. Run/deploy the backend.
4. Point the webpage at the backend endpoint to fetch the latest activities.
