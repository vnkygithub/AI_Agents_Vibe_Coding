import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchIssue, testJira } from './jira.js';
import { generateTestCases } from './llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Locally: .env in 02_Implementation/ or its parent. On Vercel: project environment variables.
const ENV_FILES = [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../../../.env')];

function loadEnv() {
  const out = { ...process.env };
  const file = ENV_FILES.find((f) => fs.existsSync(f));
  if (file) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { env: out, file };
}

const { env, file: envFile } = loadEnv();
// Server defaults. JIRA_URL is not in the supplied .env; fall back to the site used by the sibling projects.
const defaults = {
  jira: { url: (env.JIRA_URL || 'https://vnky.atlassian.net').replace(/\/+$/, ''), email: env.JIRA_EMAIL || '', token: env.JIRA_API_TOKEN || '' },
  llm: { groqKey: env.GROQ_API_TOKEN || '', groqModel: env.GROQ_MODEL || 'openai/gpt-oss-120b' },
};

// Stateless: overlay non-empty user-supplied values (from Settings / uploaded .env) on the defaults.
const pick = (v) => (typeof v === 'string' && v.trim() ? v.trim() : '');
const jiraCfg = (o = {}) => ({
  url: (pick(o.url) || defaults.jira.url).replace(/\/+$/, ''),
  email: pick(o.email) || defaults.jira.email,
  token: pick(o.token) || defaults.jira.token,
});
const llmCfg = (groqKey) => ({ ...defaults.llm, groqKey: pick(groqKey) || defaults.llm.groqKey });

const app = express();
app.use(express.json());

const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) { res.status(e.status || 500).json({ error: e.publicMessage || 'Unexpected server error.' }); console.error('[error]', e.status || 500, e.publicMessage || e.message); }
};

// Secrets never leave the server: only "is a token configured" is reported.
app.get('/api/settings', (_req, res) => res.json({
  email: defaults.jira.email, url: defaults.jira.url, hasToken: !!defaults.jira.token, configured: !!(defaults.jira.email && defaults.jira.token),
}));

app.post('/api/jira/test', wrap((req) => testJira(jiraCfg(req.body))));

app.post('/api/testcases', wrap(async (req) => {
  const key = String(req.body.issueKey || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
    throw Object.assign(new Error(), { status: 400, publicMessage: 'Invalid Jira issue ID. Expected format like PROJ-123.' });
  }
  const issue = await fetchIssue(jiraCfg(req.body.jira), key);
  const testCases = await generateTestCases(llmCfg(req.body.groqKey), issue);
  return { issue: { key: issue.key, summary: issue.summary, url: issue.url }, testCases };
}));

export default app;

if (!process.env.VERCEL) {
  const PORT = 4002;
  app.listen(PORT, () => console.log(`API on http://localhost:${PORT} (.env ${envFile ? 'loaded' : 'NOT FOUND'})`));
}
