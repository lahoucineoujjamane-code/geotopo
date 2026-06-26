// GET    /api/projects/:id  → get project + layers
// PUT    /api/projects/:id  → update project
// DELETE /api/projects/:id  → delete project + layers + R2 files
import { json, err, getUser } from '../../_shared.js';

async function getProject(id, userId, env) {
  return env.DB.prepare(
    'SELECT * FROM projects WHERE id=? AND user_id=?'
  ).bind(id, userId).first();
}

export async function onRequestGet({ request, env, params }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);

  const project = await getProject(params.id, user.id, env);
  if (!project) return err('Projet introuvable', 404);

  // Update last_opened
  await env.DB.prepare("UPDATE projects SET last_opened=datetime('now') WHERE id=?")
    .bind(params.id).run();

  // Load layers
  const { results: layers } = await env.DB.prepare(
    `SELECT id, name, type, r2_key, geojson, style, visible, z_index
     FROM layers WHERE project_id=? ORDER BY z_index ASC, created_at ASC`
  ).bind(params.id).all();

  return json({ project, layers });
}

export async function onRequestPut({ request, env, params }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);

  const project = await getProject(params.id, user.id, env);
  if (!project) return err('Projet introuvable', 404);

  let body; try { body = await request.json(); } catch { return err('JSON invalide'); }
  const { name, description, crs, base_map, center_lat, center_lon, zoom } = body;

  await env.DB.prepare(
    `UPDATE projects SET
       name        = COALESCE(?, name),
       description = COALESCE(?, description),
       crs         = COALESCE(?, crs),
       base_map    = COALESCE(?, base_map),
       center_lat  = COALESCE(?, center_lat),
       center_lon  = COALESCE(?, center_lon),
       zoom        = COALESCE(?, zoom),
       updated_at  = datetime('now')
     WHERE id=?`
  ).bind(
    name ?? null, description ?? null, crs ?? null,
    base_map ?? null, center_lat ?? null, center_lon ?? null, zoom ?? null,
    params.id
  ).run();

  return json({ ok: true, message: 'Projet mis à jour' });
}

export async function onRequestDelete({ request, env, params }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);

  const project = await getProject(params.id, user.id, env);
  if (!project) return err('Projet introuvable', 404);

  // Delete R2 files
  if (env.R2) {
    const { results: layers } = await env.DB.prepare(
      'SELECT r2_key FROM layers WHERE project_id=? AND r2_key IS NOT NULL'
    ).bind(params.id).all();
    await Promise.allSettled(layers.map(l => env.R2.delete(l.r2_key)));
  }

  await env.DB.prepare('DELETE FROM projects WHERE id=?').bind(params.id).run();
  return json({ ok: true, message: 'Projet supprimé' });
}
