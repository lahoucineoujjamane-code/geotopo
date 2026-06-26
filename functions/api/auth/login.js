// POST /api/auth/login
import { json, err, hashPassword, randomHex, uuid, signJWT, sha256hex } from '../../_shared.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('JSON invalide'); }

  const { email = '', password = '' } = body;
  if (!email || !password) return err('Email et mot de passe requis');

  const user = await env.DB.prepare(
    "SELECT * FROM users WHERE email = ? AND is_active = 1"
  ).bind(email.toLowerCase().trim()).first();

  // Always compute hash to prevent timing attacks
  const hash = await hashPassword(password, user?.salt || 'dummy_salt_prevent_timing');
  if (!user || hash !== user.password_hash) return err('Email ou mot de passe incorrect', 401);

  await env.DB.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").bind(user.id).run();

  const raw     = await randomHex(32);
  const tokHash = await sha256hex(raw);
  const sid     = uuid();
  const exp     = new Date(Date.now() + 30 * 86400000).toISOString();
  const ip      = request.headers.get('CF-Connecting-IP') || '';
  const ua      = (request.headers.get('User-Agent') || '').slice(0, 200);

  await env.DB.prepare(
    'INSERT INTO sessions(id,user_id,token_hash,expires_at,ip,ua) VALUES(?,?,?,?,?,?)'
  ).bind(sid, user.id, tokHash, exp, ip, ua).run();

  const token = await signJWT(
    { sub: user.id, sid, exp: Math.floor(Date.now() / 1000) + 2592000 },
    env.JWT_SECRET
  );

  return json({
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan, trialEndsAt: user.trial_ends_at }
  });
}
