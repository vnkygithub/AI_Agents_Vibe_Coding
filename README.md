# AI Agents — Vibe Coding

Three AI agents that turn a Jira issue into QA documents. Each agent has the same layout: `00_Design` (UI mock-ups), `01_Plan` (prompt and template), and `02_Implementation` (React + Express app, with its own README).

| Agent | Folder | Live demo |
|-------|--------|-----------|
| Test Strategy Builder | `01_Intelligent_Test_Strategy_Builder_AI_Agent` | https://ai-test-strategy-generator-vibe.vercel.app |
| Test Plan Generator | `02_Intelligent_Test_Planning_AI_Agent` | https://ai-test-plan-generator-vibe.vercel.app |
| Test Case Generator | `03_Intelligent_Test_Case_Designer_AI_Agent` | https://ai-test-case-generator-vibe.vercel.app |

## Run any agent locally
```bash
cd <agent folder>/02_Implementation
npm install
npm run dev
```
Each app needs a `.env` with `JIRA_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` and `GROQ_API_TOKEN`. See its `.env.example`. Never commit `.env` files.
