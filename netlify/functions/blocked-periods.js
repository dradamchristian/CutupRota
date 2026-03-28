import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { action, blocked, id } = parseBody(event);
    const supabase = getAdminClient();

    if (action === 'upsert') {
      if (!blocked?.start_time || !blocked?.end_time) {
        return json(400, { error: 'start_time and end_time are required' });
      }

      if (!['date', 'weekday'].includes(blocked.block_type)) {
        return json(400, { error: 'block_type must be date or weekday' });
      }

      const { error } = await supabase.from('blocked_periods').upsert(blocked, { onConflict: 'id' });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (action === 'delete') {
      const { error } = await supabase.from('blocked_periods').delete().eq('id', id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unknown action' });
  } catch (error) {
    return json(500, { error: error.message || 'Blocked periods operation failed' });
  }
}
