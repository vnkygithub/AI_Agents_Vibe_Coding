import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { marked } from 'marked';
import './styles.css';

async function api(path, body) {
  const res = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: 'Invalid response from server.' }));
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
  return data;
}

// Parse a .env file in the browser. Values are kept in page memory only (never stored).
function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const EMPTY = {
  jira: { url: '', email: '', token: '' },
  llm: { provider: 'groq', ollamaUrl: '', ollamaModel: '', groqKey: '', groqModel: '' },
};

function Status({ s }) {
  if (!s) return null;
  return <div className={`status ${s.type}`}>{s.text}</div>;
}

function MainPage({ overrides }) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!/^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(key.trim())) { setError('Enter a valid Jira issue ID, e.g. QA-123.'); return; }
    setLoading(true); setError('');
    try { setResult(await api('/api/plan', { issueKey: key.trim(), ...overrides })); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="page">
      <section className="card plan">
        <h2>Test Plan</h2>
        {loading && <div className="empty"><span className="spinner" /> Fetching Jira issue and generating test plan…</div>}
        {!loading && !result && <div className="empty">Enter a Jira ticket below to generate a test plan.</div>}
        {!loading && result && (
          <>
            <div className="source">Source: <a href={result.issue.url} target="_blank" rel="noreferrer">{result.issue.key}</a> — {result.issue.summary}</div>
            <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(result.plan.replace(/</g, '&lt;')) }} />
          </>
        )}
      </section>
      <form className="card prompt" onSubmit={submit}>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Jira Ticket (e.g. QA-123)" disabled={loading} />
        <button disabled={loading || !key.trim()}>{loading ? 'Generating…' : 'Generate'}</button>
      </form>
      {error && <div className="status error">{error}</div>}
    </div>
  );
}

function SettingsPage({ overrides, setOverrides }) {
  const [jira, setJira] = useState(overrides.jira);
  const [llm, setLlm] = useState(overrides.llm);
  const [meta, setMeta] = useState({});
  const [envStatus, setEnvStatus] = useState(null);
  const [jiraStatus, setJiraStatus] = useState(null);
  const [llmStatus, setLlmStatus] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api('/api/settings').then((s) => {
      setMeta({ hasToken: s.jira.hasToken, hasGroqKey: s.llm.hasGroqKey, url: s.jira.url, email: s.jira.email, ...s.llm });
    }).catch((e) => setJiraStatus({ type: 'error', text: e.message }));
  }, []);

  const run = async (name, fn, setStatus) => {
    setBusy(name); setStatus({ type: 'info', text: 'Working…' });
    try { setStatus({ type: 'success', text: (await fn()).message }); }
    catch (e) { setStatus({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  };
  const apply = async () => {
    setOverrides({ jira, llm });
    return { message: 'Applied for this browser tab (not stored; cleared on reload).' };
  };

  const loadEnvFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const env = parseEnv(await file.text());
    const nextJira = { url: env.JIRA_URL || jira.url, email: env.JIRA_EMAIL || jira.email, token: env.JIRA_API_TOKEN || jira.token };
    const nextLlm = { ...llm, groqKey: env.GROQ_API_TOKEN || llm.groqKey };
    setJira(nextJira); setLlm(nextLlm); setOverrides({ jira: nextJira, llm: nextLlm });
    const found = ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'GROQ_API_TOKEN'].filter((k) => env[k]);
    setEnvStatus(found.length
      ? { type: 'success', text: `Loaded ${found.join(', ')} from ${file.name}. Applied for this tab only.` }
      : { type: 'error', text: `No recognised keys in ${file.name}. Expected JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN, GROQ_API_TOKEN.` });
  };

  const ph = (val, fallback) => (val ? `${val} (default)` : fallback);

  return (
    <div className="page">
      <section className="card env">
        <h2>Use your own .env</h2>
        <p className="hint">Optional. Leave fields empty to use the server defaults. Values you provide are sent with each request and are never saved.</p>
        <label className="file">Load .env file<input type="file" accept=".env,.txt,text/plain" onChange={loadEnvFile} /></label>
        <Status s={envStatus} />
      </section>

      <section className="card jira">
        <h2>Jira Connection</h2>
        <label>Token<input type="password" value={jira.token} placeholder={meta.hasToken ? '•••••• (server default)' : 'API token'} onChange={(e) => setJira({ ...jira, token: e.target.value })} /></label>
        <label>Email<input value={jira.email} placeholder={ph(meta.email, 'you@example.com')} onChange={(e) => setJira({ ...jira, email: e.target.value })} /></label>
        <label>URL<input value={jira.url} placeholder={ph(meta.url, 'https://your-domain.atlassian.net')} onChange={(e) => setJira({ ...jira, url: e.target.value })} /></label>
        <div className="row">
          <button disabled={!!busy} onClick={() => run('jt', () => api('/api/jira/test', jira), setJiraStatus)}>Test Connection</button>
          <button className="secondary" disabled={!!busy} onClick={() => run('js', apply, setJiraStatus)}>Apply</button>
        </div>
        <Status s={jiraStatus} />
      </section>

      <section className="card llm">
        <h2>LLM Configuration</h2>
        <label className="radio"><input type="radio" checked={llm.provider === 'ollama'} onChange={() => setLlm({ ...llm, provider: 'ollama' })} /> 1. Ollama Connection</label>
        <div className="indent">
          <label>URL<input value={llm.ollamaUrl} placeholder={ph(meta.ollamaUrl, '')} onChange={(e) => setLlm({ ...llm, ollamaUrl: e.target.value })} /></label>
          <label>Model<input value={llm.ollamaModel} placeholder={ph(meta.ollamaModel, '')} onChange={(e) => setLlm({ ...llm, ollamaModel: e.target.value })} /></label>
        </div>
        <label className="radio"><input type="radio" checked={llm.provider === 'groq'} onChange={() => setLlm({ ...llm, provider: 'groq' })} /> 2. <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq.com</a> (API Key)</label>
        <div className="indent">
          <label>API Key<input type="password" value={llm.groqKey} placeholder={meta.hasGroqKey ? '•••••• (server default)' : 'gsk_…'} onChange={(e) => setLlm({ ...llm, groqKey: e.target.value })} /></label>
          <label>Model<input value={llm.groqModel} placeholder={ph(meta.groqModel, '')} onChange={(e) => setLlm({ ...llm, groqModel: e.target.value })} /></label>
        </div>
        <div className="row">
          <button disabled={!!busy} onClick={() => run('lt', () => api('/api/llm/test', llm), setLlmStatus)}>
            {llm.provider === 'ollama' ? 'Test Local LLM' : 'Test Groq.com'}
          </button>
          <button className="secondary" disabled={!!busy} onClick={() => run('ls', apply, setLlmStatus)}>Apply</button>
        </div>
        <Status s={llmStatus} />
      </section>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('main');
  const [overrides, setOverrides] = useState(EMPTY);
  return (
    <>
      <header>
        <h1>Intelligent Test Plan Creator</h1>
        <nav>
          <button className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>Main</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
        </nav>
      </header>
      <div style={{ display: tab === 'main' ? 'block' : 'none' }}><MainPage overrides={overrides} /></div>
      {tab === 'settings' && <SettingsPage overrides={overrides} setOverrides={setOverrides} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
