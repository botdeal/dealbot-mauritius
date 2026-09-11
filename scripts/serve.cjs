const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const allowed = {'/': 'index.html', '/index.html': 'index.html', '/vendor/supabase-2.116.0.js': 'vendor/supabase-2.116.0.js', '/app.js': 'app.js', '/backend.js': 'backend.js'};
  const file = allowed[pathname];
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(path.join(root, file)).pipe(res);
}).listen(Number(process.env.PORT || 3000), '0.0.0.0');
