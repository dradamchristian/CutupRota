import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

function normalizeText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function normalizeDuration(value) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return null;
  if (asNumber <= 0) return null;
  return Math.round(asNumber);
}

function isMissingTableError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find the table');
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { action, entry, id } = parseBody(event);
    const supabase = getAdminClient();

    if (action === 'create') {
      const requestedBy = normalizeText(entry?.requested_by, 80);
      const specialties = normalizeText(entry?.specialties, 120);
      const notes = normalizeText(entry?.notes, 400);
      const durationMinutes = normalizeDuration(entry?.duration_minutes);
      const benchId = entry?.bench_id ?? null;

      if (!requestedBy || !durationMinutes) {
        return json(400, { error: 'Missing required waitlist fields.' });
      }

      const { data, error } = await supabase
        .from('bench_waitlist')
        .insert({
          requested_by: requestedBy,
          specialties: specialties || null,
          duration_minutes: durationMinutes,
          notes: notes || null,
          bench_id: benchId
        })
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        if (isMissingTableError(error)) {
          return json(500, {
            error: 'bench_waitlist table is missing. Please create it before using this feature.'
          });
        }
        throw error;
      }

      return json(200, { ok: true, entry: data });
    }

    if (action === 'complete') {
      if (!id) return json(400, { error: 'Missing waitlist id.' });
      const { error } = await supabase
        .from('bench_waitlist')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (action === 'delete') {
      if (!id) return json(400, { error: 'Missing waitlist id.' });
      const { error } = await supabase.from('bench_waitlist').delete().eq('id', id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    return json(400, { error: 'Unsupported action.' });
  } catch (err) {
    return json(500, { error: err.message || 'Waitlist action failed.' });
  }
}
