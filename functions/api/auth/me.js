// GET /api/auth/me
import { json, err, getUser } from '../../_shared.js';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return err('Non authentifié', 401);
  return json({ id: user.id, email: user.email, name: user.name, plan: user.plan, trialEndsAt: user.trial_ends_at });
}
