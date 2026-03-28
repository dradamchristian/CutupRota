import { json, parseBody } from './_supabaseAdmin.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const { pin } = parseBody(event);
  if (!pin) return json(400, { error: 'PIN required' });

  if (pin !== process.env.ADMIN_PIN) {
    return json(401, { error: 'Invalid PIN' });
  }

  return json(200, { ok: true });
}
