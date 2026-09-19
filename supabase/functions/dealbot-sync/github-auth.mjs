// Short-lived GitHub OIDC only. No Supabase credential is sent to GitHub.
export const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'dealbot-admitad-collector';
const REPOSITORY = 'botdeal/dealbot-mauritius';
export function validateClaims(p, now = Date.now() / 1000) {
  const subjects = [
    `repo:${REPOSITORY}:ref:refs/heads/main`,
    'repo:botdeal@325603375/dealbot-mauritius@1359049058:ref:refs/heads/main'
  ];
  if (p.iss !== ISSUER || p.aud !== AUDIENCE || !subjects.includes(p.sub)
      || p.repository !== REPOSITORY || p.repository_id !== '1359049058'
      || p.repository_owner_id !== '325603375' || p.ref !== 'refs/heads/main'
      || p.workflow_ref !== `${REPOSITORY}/.github/workflows/admitad-sync.yml@refs/heads/main`
      || !['push', 'workflow_dispatch', 'schedule'].includes(p.event_name)
      || p.runner_environment !== 'github-hosted' || p.repository_visibility !== 'public'
      || !Number.isFinite(p.exp) || p.exp <= now || !Number.isFinite(p.nbf) || p.nbf > now + 30
      || !Number.isFinite(p.iat) || p.iat > now + 30 || now - p.iat > 600
      || p.exp - p.iat > 600 || typeof p.run_id !== 'string' || !/^\d+$/.test(p.run_id)) {
    throw Error('unauthorized');
  }
  return p;
}
function bytes(s) {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
let cached;
export async function verifyGithubToken(token) {
  if (typeof token !== 'string' || token.length > 16000) throw Error('unauthorized');
  const parts = token.split('.'); if (parts.length !== 3) throw Error('unauthorized');
  const header = JSON.parse(new TextDecoder().decode(bytes(parts[0])));
  if (header.alg !== 'RS256' || header.typ !== 'JWT' || typeof header.kid !== 'string') throw Error('unauthorized');
  if (!cached || Date.now() - cached.at > 300000) {
    const r = await fetch(ISSUER + '/.well-known/jwks', {signal: AbortSignal.timeout(10000), redirect: 'error'});
    if (!r.ok) throw Error('unauthorized');
    cached = {at: Date.now(), keys: (await r.json()).keys};
  }
  const jwk = cached.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.use === 'sig');
  if (!jwk) throw Error('unauthorized');
  const key = await crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]))) throw Error('unauthorized');
  return validateClaims(JSON.parse(new TextDecoder().decode(bytes(parts[1]))));
}

export async function githubBridge(req, rpc) {
  const response = (body, status) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
  if (req.method !== 'POST') return response({ok: false, error: 'method_not_allowed'}, 405);
  let claims;
  try { claims = await verifyGithubToken((req.headers.get('Authorization') || '').replace(/^Bearer /, '')); }
  catch { return response({ok: false, error: 'unauthorized'}, 401); }
  try {
    if (!req.body) throw Error();
    const reader = req.body.getReader(); let size = 0; const chunks = [];
    try {
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.length; if (size > 2097152) throw Error(); chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const buffer = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    const request = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(buffer));
    if (request.op === 'begin' && request.key !== `github-${claims.run_id}-${claims.run_attempt}`) throw Error();
    const result = await rpc(request);
    if (result.error) return response({ok: false, error: 'import_rejected'}, 400);
    return response({ok: true, ...result.data}, 200);
  } catch { return response({ok: false, error: 'invalid_request'}, 400); }
}
