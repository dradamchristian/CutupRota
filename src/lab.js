import { supabase } from './lib/supabaseClient.js';
import { buildVisibleDates, formatDateKey } from './lib/date.js';
import { buildDayBlocks } from './lib/slotBuilder.js';
import { escapeHtml, fmtDateLong, fmtTime } from './lib/format.js';

const el = {
  sub: document.getElementById('labSub'),
  board: document.getElementById('labBoard'),
  loading: document.getElementById('labLoading'),
  error: document.getElementById('labError')
};

const params = new URLSearchParams(window.location.search);
const benchParam = params.get('bench');

async function loadLabView() {
  try {
    el.loading.classList.remove('hidden');
    const [settingsRes, benchesRes, bookingsRes, blockedRes] = await Promise.all([
      supabase.from('app_settings').select('*').limit(1).single(),
      supabase.from('benches').select('*').eq('active', true).order('display_order', { ascending: true }),
      supabase.from('bookings').select('*').order('start_at', { ascending: true }),
      supabase.from('blocked_periods').select('*')
    ]);

    if (settingsRes.error) throw settingsRes.error;
    if (benchesRes.error) throw benchesRes.error;
    if (bookingsRes.error) throw bookingsRes.error;
    if (blockedRes.error) throw blockedRes.error;

    const settings = settingsRes.data;
    const benches = benchParam
      ? benchesRes.data.filter((b) => String(b.id) === String(benchParam))
      : benchesRes.data;

    const dates = buildVisibleDates({
      daysAhead: Math.min(Number(settings.booking_days_ahead || 5), 3),
      weekendsEnabled: true,
      startOffset: 0
    });

    el.sub.textContent = benchParam
      ? `Filtered bench id ${benchParam} • Auto-refresh every 30 seconds`
      : 'All benches • Auto-refresh every 30 seconds';

    el.board.innerHTML = dates.map((d) => {
      const dateKey = formatDateKey(d);
      const cols = benches.map((bench) => {
        const day = buildDayBlocks({
          dateKey,
          benchId: bench.id,
          bookings: bookingsRes.data,
          blockedPeriods: blockedRes.data,
          settings
        });

        const items = day.blocks
          .filter((x) => x.kind === 'booked')
          .map(({ booking }) => `<li><strong>${fmtTime(booking.start_at)}-${fmtTime(booking.end_at)}</strong> ${escapeHtml(booking.booked_by)} (${escapeHtml(booking.specialties)})</li>`)
          .join('') || '<li class="muted">No bookings</li>';

        return `<section class="bench-column lab-column"><h3>${escapeHtml(bench.name)}</h3><ul>${items}</ul></section>`;
      }).join('');

      return `<article class="day-card panel"><h2>${fmtDateLong(d)}</h2><div class="bench-grid">${cols}</div></article>`;
    }).join('');

    el.error.classList.add('hidden');
  } catch (err) {
    el.error.className = 'message error';
    el.error.textContent = `Lab view failed to load: ${err.message}`;
    el.error.classList.remove('hidden');
  } finally {
    el.loading.classList.add('hidden');
  }
}

loadLabView();
setInterval(loadLabView, 30000);
