// functions/_shared.js
// Shared utilities — imported by all API functions

// ── CORS headers ────────────────────────────────────────────
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
};

// ── Response helpers ────────────────────────────────────────
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export function err(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// ── Crypto ──────────────────────────────────────────────────
export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function randomHex(n = 32) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// ── JWT HS256 ───────────────────────────────────────────────
export async function signJWT(payload, secret) {
  const enc = obj => btoa(JSON.stringify(obj))
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const h = enc({ alg:'HS256', typ:'JWT' });
  const b = enc(payload);
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name:'HMAC', hash:'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(`${h}.${b}`));
  const s = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  return `${h}.${b}.${s}`;
}

export async function verifyJWT(token, secret) {
  try {
    const [h, b, s] = token.split('.');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name:'HMAC', hash:'SHA-256' }, false, ['verify']
    );
    const sigBuf = Uint8Array.from(
      atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key, sigBuf,
      new TextEncoder().encode(`${h}.${b}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(b.replace(/-/g,'+').replace(/_/g,'/')));
    if (payload.exp && Date.now()/1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ── Auth guard ──────────────────────────────────────────────
export async function getUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload?.sub) return null;
  const hash = await sha256hex(token);
  return await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.plan, u.trial_ends_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.expires_at > datetime('now')
       AND u.is_active = 1`
  ).bind(hash).first();
}
