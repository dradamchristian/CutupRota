import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const payload = parseBody(event);
    const supabase = getAdminClient();

    const { data: existing, error: readErr } = await supabase.from('app_settings').select('id').limit(1).single();
    if (readErr) throw readErr;

    const { error } = await supabase
      .from('app_settings')
      .update(payload)
      .eq('id', existing.id);

    if (error) throw error;

    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: error.message || 'Failed to update settings' });
  }
}
