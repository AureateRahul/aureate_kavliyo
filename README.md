# aureate_kavliyo

## Deploy Backend To Vercel

This repo now includes backend Vercel config in [backend/vercel.json](backend/vercel.json).

1. In Vercel, create a new project from this repo.
2. Set Root Directory to backend.
3. Build settings:
	- Framework Preset: Other
	- Build Command: leave empty
	- Output Directory: leave empty
4. Add environment variables in Vercel Project Settings:
	- KLAVIYO_API_KEY
	- SUPABASE_URL
	- SUPABASE_SERVICE_KEY
	- ANTHROPIC_API_KEY (required for /api/ai-insights)
5. Deploy.

The backend will be served from your Vercel domain and all paths are routed to Flask app.py.

## Frontend Backend URL

Frontend now supports a configurable backend URL via Vite env var:

- VITE_BACKEND_URL

Use [frontend/.env.example](frontend/.env.example) as reference.
Set VITE_BACKEND_URL in your frontend Vercel project to your deployed backend domain.
