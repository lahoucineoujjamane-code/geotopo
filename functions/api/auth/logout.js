// POST /api/auth/logout
import { json, sha256hex } from '../../_shared.js';

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const hash = await sha256hex(auth.slice(7).trim());
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();
  }
  return json({ ok: true });
}
