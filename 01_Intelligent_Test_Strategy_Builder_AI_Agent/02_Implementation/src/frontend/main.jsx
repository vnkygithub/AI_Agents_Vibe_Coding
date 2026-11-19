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

// Parse a .env file in the browser. Values stay in page memory only (never stored).
function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const EMPTY = { jira: { url: '', email: '', token: '' }, groqKey: '' };

const FEATURES = [
  ['Scope & objectives', 'What to test and what to leave out.'],
  ['Test approach', 'Coverage across key test types.'],
  ['Risks & dependencies', 'The things that could affect delivery.'],
  ['Entry & exit criteria', 'A shared definition of release readiness.'],
];
const STEPS = [
  ['Connect your Jira', 'Set up your token and email once.'],
  ['Enter a Jira ID', 'Choose the issue you want to plan for.'],
  ['Get your strategy', 'Use the generated plan to guide testing.'],
];

function Generator({ settings, overrides, goSettings }) {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!/^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(key.trim())) { setError('Enter a valid Jira issue key, e.g. PROJ-123.'); return; }
    setLoading(true); setError('');
    try { setResult(await api('/api/strategy', { issueKey: key.trim(), ...overrides })); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <main className="container">
      <p className="eyebrow">Plan with confidence</p>
      <h1>A clear strategy. A stronger release.</h1>
      <p className="lead">Turn your Jira requirements into a focused, actionable test strategy.</p>

      <div className="grid">
        <form className="card form-card" onSubmit={submit}>
          <h2>Generate test strategy</h2>
          <p className="muted">Start with the Jira issue you want to test.</p>
          <label htmlFor="jira-id">Jira ID</label>
          <input id="jira-id" value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. PROJ-123" disabled={loading} />
          <p className="help">Enter an issue key from your connected Jira project.</p>

          {settings && !settings.configured && !overrides.jira.token ? (
            <div className="notice">
              <div><strong>Connect Jira to get started</strong><span>Add your credentials in Settings before generating.</span></div>
              <button type="button" className="link" onClick={goSettings}>Open settings →</button>
            </div>
          ) : (
            <div className="notice ok">
              <div><strong>Jira credentials configured</strong><span>{settings?.connection === 'connected' ? 'Connection verified.' : 'Loaded from the server configuration.'}</span></div>
              <button type="button" className="link" onClick={goSettings}>Settings →</button>
            </div>
          )}

          <button className="primary" disabled={loading || !key.trim()}>
            {loading ? <><span className="spinner" /> Generating…</> : <>Generate test strategy →</>}
          </button>
          {error && <div className="status error">{error}</div>}
        </form>

        <aside className="card info-card">
          <h3>A plan for what matters.</h3>
          <p className="muted">Your strategy brings the essentials together in one place.</p>
          <ol>
            {FEATURES.map(([t, d], i) => (
              <li key={t}><span className="num">0{i + 1}</span><div><strong>{t}</strong><span>{d}</span></div></li>
            ))}
          </ol>
        </aside>
      </div>

      {loading && <section className="card result empty"><span className="spinner dark" /> Fetching the Jira issue and generating the test strategy. This can take up to a minute…</section>}
      {!loading && result && (
        <section className="card result">
          <div className="source">Source: <a href={result.issue.url} target="_blank" rel="noreferrer">{result.issue.key}</a> — {result.issue.summary}</div>
          <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(result.strategy.replace(/</g, '&lt;')) }} />
        </section>
      )}

      <section className="steps">
        <p className="eyebrow grey">From issue to action</p>
        <div className="steps-row">
          {STEPS.map(([t, d], i) => (
            <div key={t} className="step"><span className="circle">{i + 1}</span><div><strong>{t}</strong><span>{d}</span></div></div>
          ))}
        </div>
      </section>
      <footer>Built for thoughtful testing, from the very first requirement.</footer>
    </main>
  );
}

function Settings({ settings, overrides, setOverrides, connection, setConnection }) {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState(overrides.jira.email);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const badge = { connected: 'Connected', failed: 'Not connected', untested: settings?.configured || overrides.jira.token ? 'Configured' : 'Not connected' }[connection];

  // Test the given Jira values; on success keep them (this tab only) for generation requests.
  const test = async (jira, groqKey = overrides.groqKey) => {
    setBusy(true);
    try {
      const r = await api('/api/jira/test', jira);
      setOverrides({ jira, groqKey }); setConnection('connected'); setToken('');
      setMsg({ type: 'success', text: r.message });
    } catch (e) { setConnection('failed'); setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(false); }
  };
  const testFromFields = () => test({ ...overrides.jira, ...(token.trim() && { token: token.trim() }), ...(email.trim() && { email: email.trim() }) });

  const loadEnv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const env = parseEnv(await file.text());
    const found = ['JIRA_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'GROQ_API_TOKEN'].filter((k) => env[k]);
    if (!found.length) { setMsg({ type: 'error', text: `No recognised keys in ${file.name}. Expected JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN, GROQ_API_TOKEN.` }); return; }
    const jira = { url: env.JIRA_URL || overrides.jira.url, email: env.JIRA_EMAIL || overrides.jira.email, token: env.JIRA_API_TOKEN || overrides.jira.token };
    setEmail(jira.email);
    setMsg({ type: 'info', text: `Loaded ${found.join(', ')} from ${file.name}. Testing…` });
    await test(jira, env.GROQ_API_TOKEN || overrides.groqKey);
  };

  return (
    <main className="container">
      <p className="eyebrow">Your workspace, connected</p>
      <h1>Settings</h1>
      <p className="lead">Manage your Jira connection and keep your test planning in sync.</p>
      <div className="settings-grid">
        <aside>
          <p className="eyebrow grey">Integrations</p>
          <div className="side-item">Jira connection</div>
          <p className="help">Connect your tools to bring requirements into Testwise.</p>
        </aside>
        <div>
          <section className="card jira-card">
            <div className="card-head">
              <div><h2>Jira</h2><p className="muted">Connect your account to access Jira issues.</p></div>
              <span className={`badge ${connection}`}>{badge}</span>
            </div>
            <label htmlFor="token">Jira connection</label>
            <input id="token" type="password" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder={settings?.hasToken ? '•••••••• (configured — enter a new token to replace)' : 'Enter your Jira API token'} />
            <p className="help">Use an API token from your Atlassian account.</p>
            <label htmlFor="email">Email</label>
            <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={settings?.email || 'you@company.com'} />
            <p className="help">Use the email address associated with your Jira account.</p>
            <label htmlFor="envfile">Or load a .env file</label>
            <input id="envfile" type="file" accept=".env,.txt,text/plain" onChange={loadEnv} disabled={busy} />
            <p className="help">Reads JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN and GROQ_API_TOKEN. Kept in this tab only and never stored.</p>
            <div className="tip"><strong>Use an API token, not your password</strong><span>Create a token in Atlassian under Account settings → Security → API tokens.</span></div>
            <div className="card-foot">
              <span className="muted small">{msg ? <span className={`inline ${msg.type}`}>{msg.text}</span> : connection === 'connected' ? 'Connection verified' : 'Connection not tested'}</span>
              <button className="primary small-btn" onClick={testFromFields} disabled={busy}>{busy ? 'Testing…' : 'Test connection'}</button>
            </div>
          </section>
          <p className="help after">Once connected, return to the Generator to create your first test strategy.</p>
        </div>
      </div>
    </main>
  );
}

function App() {
  const [tab, setTab] = useState('generator');
  const [settings, setSettings] = useState(null);
  const [overrides, setOverrides] = useState(EMPTY);
  const [connection, setConnection] = useState('untested');
  useEffect(() => { api('/api/settings').then(setSettings).catch(() => setSettings({ configured: false })); }, []);

  return (
    <>
      <header className="topbar">
        <div className="brand"><span className="logo">T</span>Testwise</div>
        <nav>
          <button className={tab === 'generator' ? 'active' : ''} onClick={() => setTab('generator')}>Generator</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>
        </nav>
        <div className="right"><span className="caps">Quality Engineering</span><span className="workspace">My workspace</span></div>
      </header>
      <div style={{ display: tab === 'generator' ? 'block' : 'none' }}><Generator settings={settings && { ...settings, connection }} overrides={overrides} goSettings={() => setTab('settings')} /></div>
      {tab === 'settings' && <Settings settings={settings} overrides={overrides} setOverrides={setOverrides} connection={connection} setConnection={setConnection} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
