// POST /api/layers  → save layer (with optional R2 upload for large GeoJSON)
import { json, err, getUser, uuid } from '../../_shared.js';

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);

  let body; try { body = await request.json(); } catch { return err('JSON invalide'); }
  const { project_id, name, type = 'geojson', geojson, style = {}, visible = 1, z_index = 0 } = body;

  if (!project_id) return err('project_id requis');
  if (!name?.trim()) return err('Nom de couche requis');

  // Verify project ownership
  const project = await env.DB.prepare(
    'SELECT id FROM projects WHERE id=? AND user_id=?'
  ).bind(project_id, user.id).first();
  if (!project) return err('Projet introuvable', 404);

  const id = uuid();
  const geojsonStr = geojson ? JSON.stringify(geojson) : null;
  let r2_key = null;
  let inlineGeoJSON = null;

  // Large layers → R2, small ones → D1 inline
  if (geojsonStr && geojsonStr.length > 80000 && env.R2) {
    r2_key = `layers/${user.id}/${project_id}/${id}.geojson`;
    await env.R2.put(r2_key, geojsonStr, {
      httpMetadata: { contentType: 'application/geo+json' }
    });
  } else {
    inlineGeoJSON = geojsonStr;
  }

  await env.DB.prepare(
    `INSERT INTO layers(id,project_id,user_id,name,type,r2_key,geojson,style,visible,z_index)
     VALUES(?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, project_id, user.id, name.trim(), type,
    r2_key, inlineGeoJSON,
    JSON.stringify(style), visible, z_index
  ).run();

  // Touch project updated_at
  await env.DB.prepare("UPDATE projects SET updated_at=datetime('now') WHERE id=?")
    .bind(project_id).run();

  return json({ id, message: 'Couche sauvegardée' }, 201);
}
