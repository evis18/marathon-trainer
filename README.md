# Marathon Trainer

A static browser app for goal-based race training plans.

Version one supports:

- Race goals for 10K, half marathon, and marathon
- Goal time and any plan length from 1 to 104 weeks
- Personalized runner profile with name and birthdate
- Setup fields save locally and collapse after the plan starts
- Age-aware heart-rate guardrails
- Fitness assessment from recent workout history
- Heart-rate zone estimates from imported workout HR data, with an HR field test added when the data is not strong enough
- Adaptive plan recalculation based on workout performance: pace, mileage, and heart rate
- Calendar-style plan display saved in the browser so you can return without re-uploading history
- Workout completion requires attaching the Garmin file for that workout
- Optional AI coach backend uses ChatGPT for dynamic post-workout analysis and plan adjustment
- Fallback post-workout analysis still considers pace, heart rate, distance, heat, and hills before adjusting future workouts
- Quality days include specific interval or tempo prescriptions
- Garmin file imports for FIT, TCX, GPX/XML, and CSV activity exports
- Automatic filtering to the last six months of workouts

For an initial setup, select a batch of local Garmin `.fit` files. After that, upload only the newest workout when you come back. The app keeps the saved history and calendar plan in browser storage.

## Strava direct sync

Direct Strava sync is not something a static GitHub Pages page can safely do by itself. Strava uses OAuth, which requires a client secret and access tokens. Those must live in a small backend, not in public browser code.

The `strava-backend/` folder contains a starter backend plan for the next step:

1. Create a Strava API app.
2. Put `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_REDIRECT_URI` in the backend environment.
3. Run/deploy the backend.
4. Point the webpage at the backend endpoint to fetch the latest activities.

## AI coach

The browser app cannot safely store an OpenAI API key, so ChatGPT coaching runs through the local `coach-backend/` service.

Start it with:

```sh
cd coach-backend
export OPENAI_API_KEY="your_api_key_here"
npm start
```

Then complete a planned workout by attaching its Garmin file. The site will ask the AI coach for a postmortem and future-plan adjustment. If the backend is not running, the site uses the local fallback analysis and tells you that it did.
