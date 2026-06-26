// DELETE /api/layers/:id
import { json, err, getUser } from '../../_middleware.js';

export async function onRequestDelete({ request, env, params }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);

  const layer = await env.DB.prepare(
    'SELECT * FROM layers WHERE id=? AND user_id=?'
  ).bind(params.id, user.id).first();
  if (!layer) return err('Couche introuvable', 404);

  if (layer.r2_key && env.R2) {
    await env.R2.delete(layer.r2_key).catch(() => {});
  }

  await env.DB.prepare('DELETE FROM layers WHERE id=?').bind(params.id).run();
  return json({ ok: true, message: 'Couche supprimée' });
}
