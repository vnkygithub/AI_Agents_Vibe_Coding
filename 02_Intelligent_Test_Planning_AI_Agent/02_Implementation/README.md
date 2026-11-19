# Intelligent Test Plan Creator

Enter a Jira issue ID, get a test plan built from `01_Plan/Test_Plan_Template.md`.

## Setup
Requires Node.js 18+.
```bash
cd 02_Implementation
npm install
npm run dev        # API on :4000, UI on http://localhost:5173
```

## Configuration
The backend reads `../.env` (the `02_Intelligent_Test_Planning_AI_Agent/.env` file). See `.env.example`:
`JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `GROQ_API_TOKEN`.
Secrets stay on the server. The Settings page shows only whether a token is loaded. Values you enter in Settings are kept in server memory and are lost on restart.

**LLM:** The default is Groq with `openai/gpt-oss-120b`, called with `temperature: 0` and `seed: 42`. You can switch to Ollama (default `http://localhost:11434`, model `llama3.1`) in Settings. Output can still vary a little between runs.

## Deployment (Vercel)
Live at https://ai-test-plan-generator-vibe.vercel.app
- `api/index.js` exposes the Express app as a serverless function, and `vercel.json` handles the build and `/api` routing
- Server defaults are encrypted Vercel environment variables: `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `GROQ_API_TOKEN`
- Users can override them on the Settings page with **Load .env file** or by typing values. Overrides are sent with each request, never stored, and cleared on reload
- Redeploy with `npx vercel deploy --prod` (after `npx vercel login`)
- Ollama is not reachable from Vercel, so use Groq there
- `src/backend/Test_Plan_Template.md` is a copy of `01_Plan/Test_Plan_Template.md`. Re-copy it after editing the template

## Structure
- `src/backend/server.js`: Express API (`/api/settings`, `/api/jira/test`, `/api/llm/test`, `/api/plan`)
- `src/backend/jira.js`: read-only Jira REST v3 fetch and ADF-to-text conversion
- `src/backend/llm.js`: prompt and Groq/Ollama calls
- `src/frontend/`: React UI (Main page and Settings page)

## Verified (live, 2026-11-17)
- Settings load without exposing secrets
- Jira Test Connection succeeds
- Groq test succeeds
- KAN-4 produced a plan with all template sections in order
- Invalid IDs return 400
- Missing issues return a "not found" message
- UI serves at 200

## Not verified
- Ollama: not running locally
- Browser click-through: no automated UI tests

## Limitations
- The Jira project is read only
- Acceptance criteria are taken from a custom field named "acceptance…" if one exists, otherwise from the description
