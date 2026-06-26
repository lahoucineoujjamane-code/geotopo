// POST /api/files/upload  → multipart upload to R2
import { json, err, getUser, uuid } from '../../_middleware.js';

const ALLOWED_TYPES = {
  'geojson': 'application/geo+json',
  'json':    'application/json',
  'kml':     'application/vnd.google-earth.kml+xml',
  'gpx':     'application/gpx+xml',
  'dxf':     'application/dxf',
  'csv':     'text/csv',
};
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);
  if (!env.R2) return err('Stockage R2 non configuré', 503);

  let formData;
  try { formData = await request.formData(); }
  catch { return err('FormData requis'); }

  const file       = formData.get('file');
  const project_id = formData.get('project_id') || 'misc';
  const fileType   = formData.get('type') || 'geojson';

  if (!file) return err('Aucun fichier fourni');
  if (file.size > MAX_SIZE) return err('Fichier trop volumineux (max 10 MB)');
  if (!ALLOWED_TYPES[fileType]) return err('Type de fichier non supporté');

  const key      = `uploads/${user.id}/${project_id}/${uuid()}.${fileType}`;
  const mimeType = ALLOWED_TYPES[fileType];

  await env.R2.put(key, file.stream(), {
    httpMetadata: { contentType: mimeType }
  });

  return json({ key, url: `/api/files/${key}`, message: 'Fichier uploadé' }, 201);
}
