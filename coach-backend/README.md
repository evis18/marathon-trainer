# AI Coach Backend

This local backend lets the Marathon Trainer ask ChatGPT for a dynamic workout postmortem and plan adjustment without exposing your OpenAI API key in browser code.

## Start

Create `coach-backend/.env.local`:

```text
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5-mini
AI_COACH_DAILY_LIMIT_USD=0.50
AI_COACH_MONTHLY_LIMIT_USD=5.00
```

Then start the backend:

```sh
npm start
```

Then keep the marathon trainer open at:

```text
http://localhost:8000/marathon-trainer/
```

The webpage calls:

```text
http://localhost:8791/api/coach
```

If the backend is not running or no API key is set, the site falls back to its local rule-based analysis and says so in the Workout Data note.

## Local spend guard

The backend keeps a private local cost log at `coach-backend/usage-log.json`. It estimates the maximum possible cost before each call and refuses the call if it would cross either budget.

Defaults:

- Daily limit: `$0.50`
- Monthly limit: `$5.00`
- Model: `gpt-5-mini`

Check local usage:

```text
http://localhost:8791/api/usage
```
