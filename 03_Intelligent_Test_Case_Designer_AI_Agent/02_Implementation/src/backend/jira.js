const fail = (status, publicMessage) => Object.assign(new Error(publicMessage), { status, publicMessage });

function requireConfig({ url, email, token }) {
  if (!url || !email || !token) throw fail(400, 'Jira configuration missing (URL, email or token). Check Settings or the .env file.');
}

async function jiraGet(cfg, apiPath) {
  requireConfig(cfg);
  let res;
  try {
    res = await fetch(cfg.url + apiPath, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64'),
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw fail(502, 'Could not reach Jira (network error or invalid URL).');
  }
  if (res.status === 401) throw fail(401, 'Jira authentication failed. Check email and API token.');
  if (res.status === 403) throw fail(403, 'Permission denied by Jira for this request.');
  if (res.status === 404) throw fail(404, 'Jira issue not found, or these credentials cannot access it. Check the issue key, email and API token.');
  if (!res.ok) throw fail(502, `Jira returned an error (HTTP ${res.status}).`);
  return res.json();
}

// Atlassian Document Format -> plain text (keeps list bullets and line breaks)
function adfToText(node, depth = 0) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  const kids = (node.content || []).map((c) => adfToText(c, depth + 1)).join('');
  switch (node.type) {
    case 'paragraph': case 'heading': return kids + '\n';
    case 'listItem': return '- ' + kids.trim() + '\n';
    case 'codeBlock': return '```\n' + kids + '\n```\n';
    case 'tableRow': return '| ' + (node.content || []).map((c) => adfToText(c).trim()).join(' | ') + ' |\n';
    default: return kids;
  }
}

export async function testJira(cfg) {
  const me = await jiraGet(cfg, '/rest/api/3/myself');
  return { ok: true, message: `Connected to Jira as ${me.displayName || 'user'}.` };
}

export async function fetchIssue(cfg, key) {
  const data = await jiraGet(cfg, `/rest/api/3/issue/${encodeURIComponent(key)}?expand=names`);
  const f = data.fields || {};
  const names = data.names || {};
  // Pick up custom fields whose name mentions acceptance criteria
  const acField = Object.keys(names).find((k) => /acceptance/i.test(names[k]) && f[k]);
  const ac = acField ? adfToText(f[acField]).trim() : '';
  return {
    key: data.key,
    url: `${cfg.url}/browse/${data.key}`,
    summary: f.summary || '',
    type: f.issuetype?.name || '',
    status: f.status?.name || '',
    priority: f.priority?.name || '',
    labels: f.labels || [],
    components: (f.components || []).map((c) => c.name),
    fixVersions: (f.fixVersions || []).map((v) => v.name),
    sprint: Array.isArray(f[Object.keys(names).find((k) => names[k] === 'Sprint')])
      ? f[Object.keys(names).find((k) => names[k] === 'Sprint')].map((s) => s.name).join(', ') : '',
    assignee: f.assignee?.displayName || '',
    description: adfToText(f.description).trim(),
    acceptanceCriteria: ac,
  };
}
