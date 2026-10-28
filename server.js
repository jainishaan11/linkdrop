
const http = require('node:http');
const { Pool } = require('pg');
const config = require('./config');

if (!config.databaseUrl) {
  console.error('Missing database settings: set PG_URL (or DATABASE_URL).');
  process.exit(1);
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 5,
  ssl: config.pgSsl ? { rejectUnauthorized: false } : undefined,
});

// Log unexpected errors from idle database connections.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

// Create the table automatically if the database is empty.
async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      id bigserial PRIMARY KEY,
      url text NOT NULL,
      note text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

// Escape user-provided text before inserting it into HTML.
function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(links) {
  const items = links
    .map((l) => {
      const safeUrl = esc(l.url);
      const safeNote = esc(l.note);
      const createdAt = esc(new Date(l.created_at).toISOString());

      return `<li><a href="${safeUrl}">${safeUrl}</a><p>${safeNote}</p><time>${createdAt}</time></li>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>linkdrop</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px;color:#0f172a}
  form{display:grid;gap:8px;margin-bottom:32px}
  input,textarea,button{font:inherit;padding:8px}
  li{margin-bottom:16px}
  li p{margin:4px 0}
  time{color:#64748b;font-size:13px}
</style>
</head>
<body>
<h1>linkdrop</h1>
<form method="post" action="/links">
  <input name="url" type="url" placeholder="https://..." required>
  <textarea name="note" rows="2" placeholder="Why it is worth reading"></textarea>
  <button type="submit">Drop it</button>
</form>
<ol>
${items}
</ol>
</body>
</html>`;
}

async function listLinks() {
  const { rows } = await pool.query(
    'SELECT url, note, created_at FROM links ORDER BY created_at DESC LIMIT $1',
    [config.pageSize],
  );
  return rows;
}

async function addLink(url, note) {
  await pool.query(
    'INSERT INTO links (url, note) VALUES ($1, $2)',
    [url, note],
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => resolve(new URLSearchParams(body)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok');
    }

    if (req.method === 'GET' && req.url === '/') {
      const links = await listLinks();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(render(links));
    }

    if (req.method === 'POST' && req.url === '/links') {
      const form = await readBody(req);
      const url = (form.get('url') || '').trim();
      const note = (form.get('note') || '').trim();

      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' });
        return res.end('Please provide a valid URL.');
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        return res.end('Only HTTP and HTTPS links are allowed.');
      }

      await addLink(parsedUrl.href, note);
      res.writeHead(303, { location: '/' });
      return res.end();
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  } catch (err) {
    console.error('Request failed:', err);

    if (!res.headersSent && !res.destroyed) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Something went wrong.');
    }
  }
});

ensureSchema()
  .then(() => {
    server.listen(config.port, config.host, () => {
      console.log(
        `linkdrop listening on http://${config.host}:${config.port}`,
      );
    });
  })
  .catch((err) => {
    console.error('Could not initialize the database:', err);
    process.exit(1);
  });

process.on('SIGTERM', () => {
  server.close(() => {
    pool.end().then(() => process.exit(0));
  });
});
