# AI Coach Backend

This local backend lets the Marathon Trainer ask ChatGPT for a dynamic workout postmortem and plan adjustment without exposing your OpenAI API key in browser code.

## Start

Create `coach-backend/.env.local`:

```text
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-5.2
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
