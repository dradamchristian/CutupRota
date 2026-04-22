import { supabase } from './lib/supabaseClient.js';
import { buildVisibleDates, formatDateKey } from './lib/date.js';
import { buildDayBlocks } from './lib/slotBuilder.js';
import { escapeHtml, fmtDateLong, fmtTime } from './lib/format.js';
import { saveWaitlist } from './lib/api.js';
import { normalizeBookings } from './lib/bookings.js';
import { normalizeBenches } from './lib/benches.js';
import { normalizeBlockedPeriods } from './lib/blockedPeriods.js';

const el = {
  sub: document.getElementById('labSub'),
  board: document.getElementById('labBoard'),
  queue: document.getElementById('labQueue'),
  completeQueueSelected: document.getElementById('completeQueueSelected'),
  loading: document.getElementById('labLoading'),
  error: document.getElementById('labError')
};

const params = new URLSearchParams(window.location.search);
const benchParam = params.get('bench');
const selectedQueueIds = new Set();

function isMissingWaitlistTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('does not exist') || message.includes('could not find the table');
}

function renderQueue(queueEntries) {
  if (!el.queue) return;
  selectedQueueIds.clear();
  if (el.completeQueueSelected) el.completeQueueSelected.disabled = true;

  if (!queueEntries.length) {
    el.queue.innerHTML = '<p class="muted">No pending call-back requests.</p>';
    return;
  }

  el.queue.innerHTML = queueEntries.map((entry) => `
    <label class="checkbox waitlist-item" data-row-id="${entry.id}">
      <input type="checkbox" data-action="complete-waitlist" data-id="${entry.id}" />
      <span><strong>${escapeHtml(entry.requested_by || 'Unknown')}</strong> • ~${Number(entry.duration_minutes || 0)} min${entry.specialties ? ` • ${escapeHtml(entry.specialties)}` : ''}</span>
    </label>
  `).join('');

  el.queue.querySelectorAll('[data-action="complete-waitlist"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      const id = checkbox.dataset.id;
      if (!id) return;

      if (checkbox.checked) {
        selectedQueueIds.add(id);
      } else {
        selectedQueueIds.delete(id);
      }

      const row = checkbox.closest('[data-row-id]');
      row?.classList.toggle('selected', checkbox.checked);
      if (el.completeQueueSelected) el.completeQueueSelected.disabled = selectedQueueIds.size === 0;
    });
  });
}

async function completeSelectedQueueItems() {
  if (selectedQueueIds.size === 0) return;
  const ids = Array.from(selectedQueueIds);
  if (el.completeQueueSelected) {
    el.completeQueueSelected.disabled = true;
    el.completeQueueSelected.textContent = 'Completing…';
  }

  try {
    await Promise.all(ids.map((id) => saveWaitlist({ action: 'complete', id })));
    await loadLabView();
  } finally {
    if (el.completeQueueSelected) el.completeQueueSelected.textContent = 'Mark ticked complete';
  }
}

async function loadLabView() {
  try {
    el.loading.classList.remove('hidden');
    const [settingsRes, benchesRes, bookingsRes, blockedRes, waitlistRes] = await Promise.all([
      supabase.from('app_settings').select('*').limit(1).single(),
      supabase.from('benches').select('*').order('display_order', { ascending: true }),
      supabase.from('bookings').select('*'),
      supabase.from('blocked_periods').select('*'),
      supabase
        .from('bench_waitlist')
        .select('*')
        .is('completed_at', null)
        .order('requested_at', { ascending: true })
    ]);

    if (settingsRes.error) throw settingsRes.error;
    if (benchesRes.error) throw benchesRes.error;
    if (bookingsRes.error) throw bookingsRes.error;
    if (blockedRes.error) throw blockedRes.error;
    if (waitlistRes.error && !isMissingWaitlistTable(waitlistRes.error)) throw waitlistRes.error;

    const settings = settingsRes.data;
    const bookings = normalizeBookings(bookingsRes.data);
    const blockedPeriods = normalizeBlockedPeriods(blockedRes.data);
    const waitlist = waitlistRes.error ? [] : (waitlistRes.data || []);
    const benches = normalizeBenches(benchesRes.data)
      .filter((b) => b.active)
      .filter((b) => (benchParam ? String(b.id) === String(benchParam) : true));

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
          bookings,
          blockedPeriods,
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
    renderQueue(waitlist);

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

el.completeQueueSelected?.addEventListener('click', async () => {
  try {
    await completeSelectedQueueItems();
  } catch (err) {
    el.error.className = 'message error';
    el.error.textContent = `Could not update queue: ${err.message}`;
    el.error.classList.remove('hidden');
  }
});
