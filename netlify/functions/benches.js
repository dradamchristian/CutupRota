import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

function isMissingBenchColumnError(message = '') {
  const normalized = String(message);
  return (
    /column ['"][^'"]+['"] of relation ['"]benches['"] does not exist/i.test(normalized) ||
    /Could not find the ['"][^'"]+['"] column of ['"]benches['"]/i.test(normalized)
  );
}

function buildBenchPayload(bench, activeKey = 'active') {
  const payload = {
    name: bench.name,
    display_order: bench.display_order ?? 0
  };

  if (bench.id != null && bench.id !== '') payload.id = bench.id;

  const activeValue =
    typeof bench.active === 'boolean' ? bench.active
      : typeof bench.is_active === 'boolean' ? bench.is_active
        : typeof bench.enabled === 'boolean' ? bench.enabled
          : null;

  if (typeof activeValue === 'boolean') payload[activeKey] = activeValue;
  return payload;
}

async function upsertBenchWithActiveFallback(supabase, bench) {
  const keys = ['active', 'is_active', 'enabled'];
  let lastError = null;

  for (const key of keys) {
    const payload = buildBenchPayload(bench, key);
    const { error } = await supabase.from('benches').upsert(payload, { onConflict: 'id' });
    if (!error) return;

    lastError = error;
    if (!isMissingBenchColumnError(error.message || '')) {
      throw error;
    }
  }

  if (lastError) throw lastError;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { action, bench, id } = parseBody(event);
    const supabase = getAdminClient();

    if (action === 'upsert') {
      if (!bench?.name) return json(400, { error: 'Bench name required' });
      await upsertBenchWithActiveFallback(supabase, bench);
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
