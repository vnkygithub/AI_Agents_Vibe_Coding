import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchIssue, testJira } from './jira.js';
import { generatePlan, testLlm } from './llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Locally: .env lives in the parent of 02_Implementation. On Vercel: project environment variables.
const ENV_PATH = path.resolve(__dirname, '../../../.env');

function loadEnv() {
  const out = { ...process.env };
  if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

const env = loadEnv();
// Server-side defaults. Secrets are never returned to the browser.
const defaults = {
  jira: { url: (env.JIRA_URL || 'https://vnky.atlassian.net').replace(/\/+$/, ''), email: env.JIRA_EMAIL || '', token: env.JIRA_API_TOKEN || '' },
  llm: {
    provider: 'groq',
    groqKey: env.GROQ_API_TOKEN || '',
    groqModel: 'openai/gpt-oss-120b',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1',
  },
};

const publicSettings = () => ({
  jira: { url: defaults.jira.url, email: defaults.jira.email, hasToken: !!defaults.jira.token },
  llm: { ...defaults.llm, groqKey: undefined, hasGroqKey: !!defaults.llm.groqKey },
});

// Stateless: copy defaults and overlay non-empty values sent by the user (empty field = keep default)
const resolve = (base, src = {}) => {
  const cfg = { ...base };
  for (const [k, v] of Object.entries(src || {})) if (k in cfg && typeof v === 'string' && v.trim()) cfg[k] = v.trim();
  if (cfg.url) cfg.url = cfg.url.replace(/\/+$/, '');
  return cfg;
};

const app = express();
app.use(express.json());

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.publicMessage || 'Unexpected server error.' }); console.error('[error]', e.status || 500, e.publicMessage || e.message); }
};

app.get('/api/settings', (_req, res) => res.json(publicSettings()));
app.post('/api/jira/test', wrap((req) => testJira(resolve(defaults.jira, req.body))));
app.post('/api/llm/test', wrap((req) => testLlm(resolve(defaults.llm, req.body))));

app.post('/api/plan', wrap(async (req) => {
  const key = String(req.body.issueKey || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
    throw Object.assign(new Error(), { status: 400, publicMessage: 'Invalid Jira issue ID. Expected format like QA-123.' });
  }
  const issue = await fetchIssue(resolve(defaults.jira, req.body.jira), key);
  const plan = await generatePlan(resolve(defaults.llm, req.body.llm), issue);
  return { issue: { key: issue.key, summary: issue.summary, url: issue.url }, plan };
}));

export default app;

if (!process.env.VERCEL) {
  const PORT = 4000;
  app.listen(PORT, () => console.log(`API on http://localhost:${PORT} (.env ${fs.existsSync(ENV_PATH) ? 'loaded' : 'not found'})`));
}
