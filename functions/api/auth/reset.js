// POST /api/auth/reset  → request reset
// POST /api/auth/reset/confirm → confirm reset
import { json, err, hashPassword, randomHex, sha256hex } from '../../_shared.js';

export async function onRequestPost({ request, env }) {
  let body; try { body = await request.json(); } catch { return err('JSON invalide'); }
  const { token, password, email } = body;

  // Confirm reset (has token + password)
  if (token && password) {
    if (typeof password !== 'string' || password.length < 8) return err('Mot de passe trop court');
    const user = await env.DB.prepare(
      "SELECT * FROM users WHERE reset_token=? AND reset_expires>datetime('now')"
    ).bind(token).first();
    if (!user) return err('Token invalide ou expiré', 401);

    const salt = await randomHex(16);
    const hash = await hashPassword(password, salt);
    await env.DB.prepare(
      'UPDATE users SET password_hash=?,salt=?,reset_token=NULL,reset_expires=NULL WHERE id=?'
    ).bind(hash, salt, user.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id).run();
    return json({ ok: true, message: 'Mot de passe réinitialisé — reconnectez-vous' });
  }

  // Request reset (has email)
  if (email) {
    const user = await env.DB.prepare('SELECT id FROM users WHERE email=? AND is_active=1')
      .bind(email.toLowerCase()).first();
    // Always return ok (anti-enumeration)
    if (!user) return json({ ok: true, message: 'Si cet email existe, un lien a été envoyé.' });

    const tok     = await randomHex(32);
    const expires = new Date(Date.now() + 3600000).toISOString();
    await env.DB.prepare('UPDATE users SET reset_token=?,reset_expires=? WHERE id=?')
      .bind(tok, expires, user.id).run();

    // TODO: send email via Resend/SendGrid using env.RESEND_API_KEY
    // For dev, return token in response (REMOVE IN PRODUCTION)
    return json({ ok: true, message: 'Email envoyé.', _dev_token: tok });
  }

  return err('email ou token requis');
}
