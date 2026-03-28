import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { action, bench, id } = parseBody(event);
    const supabase = getAdminClient();

    if (action === 'upsert') {
      if (!bench?.name) return json(400, { error: 'Bench name required' });
      const { error } = await supabase.from('benches').upsert(bench, { onConflict: 'id' });
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (action === 'delete') {
      const { data: related, error: bookingErr } = await supabase.from('bookings').select('id').eq('bench_id', id).limit(1);
      if (bookingErr) throw bookingErr;
      if (related.length > 0) return json(409, { error: 'Cannot delete bench with bookings.' });

      const { error } = await supabase.from('benches').delete().eq('id', id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unknown action' });
  } catch (error) {
    return json(500, { error: error.message || 'Benches operation failed' });
  }
}
