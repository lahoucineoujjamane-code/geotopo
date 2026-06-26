// functions/_middleware.js
// Cloudflare Pages middleware — handles CORS preflight ONLY
import { CORS } from './_shared.js';

export async function onRequest(ctx) {
  if (ctx.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  return ctx.next();
}
