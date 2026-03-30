import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

let preferredBlockedPayload = null;

function parseId(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

function normalizeBlockedInput(blocked) {
  const next = { ...blocked };
  const blockType = next.block_type || next.type || (next.block_date ? 'date' : 'weekday');

  next.block_type = blockType;
  next.block_date = blockType === 'date' ? (next.block_date || null) : null;
  next.weekday = blockType === 'weekday' ? (next.weekday == null || next.weekday === '' ? null : Number(next.weekday)) : null;
  next.bench_id = parseId(next.bench_id);
  next.id = parseId(next.id);
  return next;
}

function buildBlockedVariants(blocked) {
  const normalized = normalizeBlockedInput(blocked);
  const variants = [normalized];

  if ('block_type' in normalized) {
    const withoutType = { ...normalized };
    delete withoutType.block_type;
    variants.push(withoutType);

    variants.push({ ...withoutType, type: normalized.block_type });
  }

  return variants;
}

async function upsertBlockedWithFallback(supabase, blocked) {
  const tried = new Set();
  const candidates = preferredBlockedPayload
    ? [preferredBlockedPayload(blocked), ...buildBlockedVariants(blocked)]
    : buildBlockedVariants(blocked);

  for (const candidate of candidates) {
    const key = JSON.stringify(Object.keys(candidate).sort());
    if (tried.has(key)) continue;
    tried.add(key);

    const { error } = await supabase.from('blocked_periods').upsert(candidate, { onConflict: 'id' });
    if (!error) {
      const keys = Object.keys(candidate);
      preferredBlockedPayload = (input) => {
        const normalized = normalizeBlockedInput(input);
        const result = {};
        keys.forEach((k) => {
          if (normalized[k] !== undefined) result[k] = normalized[k];
        });
        if (normalized.id != null) result.id = normalized.id;
        return result;
      };
      return;
    }

    const combined = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    const isColumnError = combined.includes('could not find') && combined.includes('column');
    if (!isColumnError) throw error;
  }

  throw new Error('Could not save blocked period because no compatible column set was found.');
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { action, blocked, id } = parseBody(event);
    const supabase = getAdminClient();

    if (action === 'upsert') {
      if (!blocked?.start_time || !blocked?.end_time) {
        return json(400, { error: 'start_time and end_time are required' });
      }

      await upsertBlockedWithFallback(supabase, blocked);
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
