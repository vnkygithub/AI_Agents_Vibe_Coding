# Testwise — Intelligent Test Case Generator

Enter a Jira issue ID and get test cases built from `01_Plan/Test_Case_Template.md`.

## Setup
Requires Node.js 18+.
```bash
cd 02_Implementation
npm install
npm run dev        # API on :4002, UI on http://localhost:5176
```

## Configuration
The backend reads `.env` from the parent folder (`03_Intelligent_Test_Case_Designer_AI_Agent/.env`), or from `02_Implementation/` if it's there. See `.env.example`.

| Key | Purpose |
|-----|---------|
| `JIRA_EMAIL`, `JIRA_API_TOKEN` | Jira credentials. They stay on the server, and the UI only sees whether a token is configured |
| `JIRA_URL` | Jira site. **Not in the supplied .env**, so it falls back to `https://vnky.atlassian.net` |
| `GROQ_API_TOKEN` | AI provider |
| `GROQ_MODEL` | Optional. Defaults to `openai/gpt-oss-120b` |

Generation uses `temperature: 0` and `seed: 42`. Output can still vary slightly between runs. The template's example values (JIRA-1234 registration) are treated as illustrative and are never copied.

On the Settings page you can enter a new token or email and click **Test connection**. Credentials that pass the test are kept in server memory until the server restarts. Failed credentials are discarded.

## Structure
- `src/backend/server.js`: Express API (`/api/settings`, `/api/jira/test`, `/api/testcases`)
- `src/backend/jira.js`: read-only Jira REST v3 fetch
- `src/backend/llm.js`: prompt rules and the Groq call
- `src/frontend/`: React UI (Test case generator and Settings pages, per `00_Design`)

## Verified (live, no mocks)
- `.env` loads and the backend starts
- Jira Test connection works with valid credentials and fails with a wrong token
- Invalid ID returns 400, and a missing issue returns "not found"
- KAN-4 produced all 10 sections plus the Human Review Gate, with 28 test case rows and none of the template's example data
- UI serves at 200

## Limitations
- No automated browser tests
- Read-only Jira access
- `01_Plan/image.png` shows a longer template variant. The app follows `Test_Case_Template.md`, as the prompt specifies

## Deployment (Vercel)
Live at https://ai-test-case-generator-vibe.vercel.app
- `api/index.js` exposes the Express app as a serverless function, and `vercel.json` handles the build and `/api` routing
- Server defaults are encrypted Vercel environment variables: `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `GROQ_API_TOKEN`
- On the Settings page, users can type a token or email, or use **Or load a .env file**. Values are tested, kept in the browser tab's memory, sent with each request, never stored, and cleared on reload
- Redeploy with `npx vercel deploy --prod` (after `npx vercel login`)
- `src/backend/Test_Case_Template.md` is a copy of `01_Plan/Test_Case_Template.md`. Re-copy it after editing the template
- The Groq free tier allows about 8,000 tokens per minute, which is roughly one generation per minute. Extra requests show a "rate limit" error
