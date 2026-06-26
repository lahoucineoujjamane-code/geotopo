// GET  /api/projects  → list user projects
// POST /api/projects  → create project
import { json, err, getUser, uuid } from '../../_middleware.js';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);

  const { results } = await env.DB.prepare(
    `SELECT id, name, description, crs, base_map, center_lat, center_lon, zoom,
            created_at, updated_at, last_opened
     FROM projects WHERE user_id=? ORDER BY updated_at DESC LIMIT 100`
  ).bind(user.id).all();

  return json({ projects: results });
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);

  let body; try { body = await request.json(); } catch { return err('JSON invalide'); }
  const {
    name = 'Nouveau projet',
    description = '',
    crs = 'EPSG:4326',
    base_map = 'osm',
    center_lat = 29.0,
    center_lon = -10.0,
    zoom = 10
  } = body;

  if (!name.trim()) return err('Nom du projet requis');

  const id = uuid();
  await env.DB.prepare(
    `INSERT INTO projects(id,user_id,name,description,crs,base_map,center_lat,center_lon,zoom)
     VALUES(?,?,?,?,?,?,?,?,?)`
  ).bind(id, user.id, name.trim(), description, crs, base_map, center_lat, center_lon, zoom).run();

  return json({ id, name: name.trim(), message: 'Projet créé' }, 201);
}
