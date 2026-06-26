// POST /api/auth/register
import { json, err, hashPassword, randomHex, uuid, signJWT, sha256hex } from '../../_middleware.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('JSON invalide'); }

  const { email = '', password = '', name = '', plan = 'free' } = body;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
    return err('Email invalide');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    return err('Mot de passe: minimum 8 caractères');
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100)
    return err('Nom invalide (min 2 caractères)');
  if (!['free', 'credit', 'annual'].includes(plan))
    return err('Plan invalide');

  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email.toLowerCase().trim()).first();
  if (existing) return err('Cet email est déjà utilisé');

  const id         = uuid();
  const salt       = await randomHex(16);
  const hash       = await hashPassword(password, salt);
  const trialEnd   = new Date(Date.now() + 30 * 86400000).toISOString();

  await env.DB.prepare(
    'INSERT INTO users(id,email,name,password_hash,salt,plan,trial_ends_at) VALUES(?,?,?,?,?,?,?)'
  ).bind(id, email.toLowerCase().trim(), name.trim(), hash, salt, plan, trialEnd).run();

  const token = await createSession(env, id, request);
  return json({ token, user: { id, email: email.toLowerCase(), name: name.trim(), plan, trialEndsAt: trialEnd } }, 201);
}

async function createSession(env, userId, request) {
  const raw  = await randomHex(32);
  const hash = await sha256hex(raw);
  const sid  = uuid();
  const exp  = new Date(Date.now() + 30 * 86400000).toISOString();
  const ip   = request.headers.get('CF-Connecting-IP') || '';
  const ua   = (request.headers.get('User-Agent') || '').slice(0, 200);
  await env.DB.prepare(
    'INSERT INTO sessions(id,user_id,token_hash,expires_at,ip,ua) VALUES(?,?,?,?,?,?)'
  ).bind(sid, userId, hash, exp, ip, ua).run();
  const jwt = await signJWT({ sub: userId, sid, exp: Math.floor(Date.now() / 1000) + 2592000 }, env.JWT_SECRET);
  return jwt;
}
