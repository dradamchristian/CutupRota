import { getAdminClient, json, parseBody } from './_supabaseAdmin.js';

export function currentDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function deleteBookingsBefore(supabase, dateKey) {
  const { error, count } = await supabase
    .from('bookings')
    .delete({ count: 'exact' })
    .lt('booking_date', dateKey);

  if (error) throw error;
  return count || 0;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const { pin } = parseBody(event);
    if (!pin) return json(400, { error: 'PIN required' });
    if (pin !== process.env.ADMIN_PIN) return json(401, { error: 'Invalid PIN' });

    const before = currentDateKey();
    const deletedCount = await deleteBookingsBefore(getAdminClient(), before);
    return json(200, { ok: true, deletedCount, before });
  } catch (error) {
    console.error('[delete-historical-bookings] cleanup failed', error);
    return json(500, { error: error.message || 'Could not delete historical bookings.' });
  }
}
