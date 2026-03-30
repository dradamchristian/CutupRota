import { supabase } from './lib/supabaseClient.js';
import { saveBooking } from './lib/api.js';
import { buildVisibleDates, combineDateTime, formatDateKey, formatLocalDateTime } from './lib/date.js';
import { canBookAt, buildDayBlocks, getEnabledDurations } from './lib/slotBuilder.js';
import { escapeHtml, fmtDateLabel, fmtTime } from './lib/format.js';
import { normalizeBookings } from './lib/bookings.js';
import { normalizeBenches } from './lib/benches.js';
import { normalizeBlockedPeriods } from './lib/blockedPeriods.js';

const el = {
  board: document.getElementById('board'),
  loading: document.getElementById('loading'),
  error: document.getElementById('error'),
  empty: document.getElementById('empty'),
  msg: document.getElementById('message'),
  rangeLabel: document.getElementById('rangeLabel'),
  prevDays: document.getElementById('prevDays'),
  nextDays: document.getElementById('nextDays'),
  benchFilter: document.getElementById('benchFilter'),
  bookingDialog: document.getElementById('bookingDialog'),
  bookingForm: document.getElementById('bookingForm'),
  bookingMeta: document.getElementById('bookingMeta'),
  durationSelect: document.getElementById('durationSelect'),
  bookingFormError: document.getElementById('bookingFormError'),
  saveBooking: document.getElementById('saveBooking'),
  cancelBooking: document.getElementById('cancelBooking'),
  deleteDialog: document.getElementById('deleteDialog'),
  deleteForm: document.getElementById('deleteForm'),
  deleteMeta: document.getElementById('deleteMeta'),
  cancelDelete: document.getElementById('cancelDelete')
};

const state = {
  settings: null,
  benches: [],
  bookings: [],
  blockedPeriods: [],
  startOffset: 0,
  selectedBench: 'all',
  pendingSlot: null,
  pendingDelete: null,
  isSavingBooking: false
};

function setMessage(text, type = 'info') {
  if (!text) {
    el.msg.classList.add('hidden');
    el.msg.textContent = '';
    return;
  }
  el.msg.className = `message ${type}`;
  el.msg.textContent = text;
}

function setLoading(isLoading) {
  el.loading.classList.toggle('hidden', !isLoading);
}

function setBookingFormError(text) {
  if (!text) {
    el.bookingFormError.textContent = '';
    el.bookingFormError.classList.add('hidden');
    return;
  }

  el.bookingFormError.textContent = text;
  el.bookingFormError.classList.remove('hidden');
}

function setBookingSaving(isSaving) {
  state.isSavingBooking = isSaving;
  el.saveBooking.disabled = isSaving;
  el.saveBooking.textContent = isSaving ? 'Saving…' : 'Save booking';
}

async function loadAllData() {
  setLoading(true);
  el.error.classList.add('hidden');

  try {
    const [settingsRes, benchesRes, bookingsRes, blockedRes] = await Promise.all([
      supabase.from('app_settings').select('*').limit(1).single(),
      supabase.from('benches').select('*').order('display_order', { ascending: true }),
      supabase.from('bookings').select('*'),
      supabase.from('blocked_periods').select('*').order('start_time', { ascending: true })
    ]);

    const errors = [settingsRes, benchesRes, bookingsRes, blockedRes]
      .map((r) => r.error)
      .filter(Boolean);

    if (errors.length) throw errors[0];

    state.settings = settingsRes.data;
    state.benches = normalizeBenches(benchesRes.data).filter((b) => b.active);
    state.bookings = normalizeBookings(bookingsRes.data);
    state.blockedPeriods = normalizeBlockedPeriods(blockedRes.data);

    renderBenchFilter();
    renderBoard();
  } catch (err) {
    el.error.classList.remove('hidden');
    el.error.textContent = `Could not load booking board: ${err.message}`;
  } finally {
    setLoading(false);
  }
}

function renderBenchFilter() {
  const options = [{ id: 'all', name: 'All benches' }, ...state.benches];
  el.benchFilter.innerHTML = options
    .map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`)
    .join('');
  el.benchFilter.value = state.selectedBench;
}

function renderBoard() {
  if (!state.settings || state.benches.length === 0) {
    el.empty.classList.remove('hidden');
    el.board.innerHTML = '';
    return;
  }
  el.empty.classList.add('hidden');

  const dates = buildVisibleDates({
    daysAhead: Number(state.settings.booking_days_ahead || 5),
    weekendsEnabled: Boolean(state.settings.weekends_enabled),
    startOffset: state.startOffset
  });

  const visibleBenches = state.selectedBench === 'all'
    ? state.benches
    : state.benches.filter((b) => String(b.id) === state.selectedBench);

  if (dates.length === 0 || visibleBenches.length === 0) {
    el.empty.classList.remove('hidden');
    el.board.innerHTML = '';
    return;
  }

  el.rangeLabel.textContent = `${fmtDateLabel(dates[0])} → ${fmtDateLabel(dates.at(-1))}`;

  const html = dates.map((date) => {
    const dateKey = formatDateKey(date);
    const benchCols = visibleBenches.map((bench) => renderBenchDayColumn(dateKey, bench)).join('');

    return `
      <article class="day-card panel">
        <h2>${fmtDateLabel(date)}</h2>
        <div class="bench-grid">${benchCols}</div>
      </article>
    `;
  }).join('');

  el.board.innerHTML = html;
  bindBoardActions(dates);
}

function renderBenchDayColumn(dateKey, bench) {
  const day = buildDayBlocks({
    dateKey,
    benchId: bench.id,
    bookings: state.bookings,
    blockedPeriods: state.blockedPeriods,
    settings: state.settings
  });

  const times = day.slots.map((slot) => {
    const classes = ['slot', slot.status];
    const click = slot.status === 'free'
      ? `data-action="open-book" data-bench="${bench.id}" data-date="${dateKey}" data-time="${fmtTime(slot.start)}"`
      : '';

    return `<button class="${classes.join(' ')}" ${click}><span>${fmtTime(slot.start)}</span></button>`;
  }).join('');

  const blocks = day.blocks.map((block) => {
    if (block.kind === 'booked') {
      const b = block.booking;
      return `
      <button class="event booked" data-action="delete-booking" data-booking="${b.id}">
        <strong>${escapeHtml(b.booked_by)}</strong>
        <span>${escapeHtml(b.specialties)}</span>
        <small>${fmtTime(b.start_at)}–${fmtTime(b.end_at)}</small>
      </button>`;
    }

    return `
      <div class="event blocked">
        <strong>Blocked</strong>
        <span>${escapeHtml(block.blocked.reason || 'Unavailable')}</span>
        <small>${block.blocked.start_time}–${block.blocked.end_time}</small>
      </div>
    `;
  }).join('');

  return `
    <section class="bench-column">
      <h3>${escapeHtml(bench.name)}</h3>
      <div class="bench-stack">
        <div class="slot-grid">${times}</div>
        <div class="events-stack">${blocks || '<p class="muted">No bookings</p>'}</div>
      </div>
    </section>
  `;
}

function bindBoardActions(dates) {
  el.board.querySelectorAll('[data-action="open-book"]').forEach((button) => {
    button.addEventListener('click', () => {
      const benchId = parseBenchId(button.dataset.bench);
      const dateKey = button.dataset.date;
      const time = button.dataset.time;
      openBookingDialog({ benchId, dateKey, time });
    });
  });

  el.board.querySelectorAll('[data-action="delete-booking"]').forEach((button) => {
    button.addEventListener('click', () => {
      const booking = state.bookings.find((b) => String(b.id) === button.dataset.booking);
      if (!booking) return;
      state.pendingDelete = booking;
      el.deleteMeta.textContent = `${booking.booked_by} (${fmtTime(booking.start_at)}–${fmtTime(booking.end_at)})`;
      el.deleteDialog.showModal();
    });
  });
}

function openBookingDialog({ benchId, dateKey, time }) {
  state.pendingSlot = { benchId, dateKey, time };
  const bench = state.benches.find((b) => b.id === benchId);
  el.bookingMeta.textContent = `${bench?.name || 'Bench'} • ${dateKey} ${time}`;

  const durations = getEnabledDurations(state.settings);
  el.durationSelect.innerHTML = durations.map((d) => `<option value="${d}">${d} min</option>`).join('');

  el.bookingForm.reset();
  setBookingFormError('');
  setBookingSaving(false);
  el.bookingDialog.showModal();
}

function parseBenchId(rawBenchId) {
  if (typeof rawBenchId !== 'string') return rawBenchId;
  const trimmed = rawBenchId.trim();
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

async function createBooking(formData) {
  const slot = state.pendingSlot;
  if (!slot) throw new Error('No booking slot selected.');

  const duration = Number(formData.get('duration_minutes'));
  const start = combineDateTime(slot.dateKey, slot.time);
  const end = new Date(start.getTime() + (duration * 60000));
  const workEnd = combineDateTime(slot.dateKey, state.settings.default_end_time);

  const day = buildDayBlocks({
    dateKey: slot.dateKey,
    benchId: slot.benchId,
    bookings: state.bookings,
    blockedPeriods: state.blockedPeriods,
    settings: state.settings
  });

  if (!canBookAt({ start, durationMins: duration, staticBlocks: day.blocks, workEnd })) {
    throw new Error('That duration is not available at this start time.');
  }

  const payload = {
    bench_id: slot.benchId,
    booked_by: formData.get('booked_by'),
    specialties: formData.get('specialties'),
    notes: formData.get('notes'),
    start_at: formatLocalDateTime(start),
    end_at: formatLocalDateTime(end)
  };

  await saveBooking({ action: 'create', booking: payload });

  setMessage('Booking created.', 'success');
  await loadAllData();
}

async function handleBookingSave() {
  if (state.isSavingBooking) return;
  setBookingFormError('');

  if (!el.bookingForm.reportValidity()) {
    setBookingFormError('Please complete all required fields before saving.');
    return;
  }

  setBookingSaving(true);

  try {
    await createBooking(new FormData(el.bookingForm));
    el.bookingDialog.close();
  } catch (err) {
    const message = `Booking failed: ${err.message}`;
    setBookingFormError(message);
    setMessage(message, 'error');
  } finally {
    setBookingSaving(false);
  }
}

async function deleteBooking() {
  if (!state.pendingDelete) return;
  await saveBooking({ action: 'delete', id: state.pendingDelete.id });
  setMessage('Booking deleted.', 'success');
  await loadAllData();
}

el.prevDays.addEventListener('click', () => {
  state.startOffset = Math.max(0, state.startOffset - Number(state.settings?.booking_days_ahead || 5));
  renderBoard();
});

el.nextDays.addEventListener('click', () => {
  state.startOffset += Number(state.settings?.booking_days_ahead || 5);
  renderBoard();
});

el.benchFilter.addEventListener('change', (event) => {
  state.selectedBench = event.target.value;
  renderBoard();
});

el.bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleBookingSave();
});

el.saveBooking.addEventListener('click', async () => {
  await handleBookingSave();
});

el.cancelBooking.addEventListener('click', () => el.bookingDialog.close());
el.cancelDelete.addEventListener('click', () => el.deleteDialog.close());

el.deleteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await deleteBooking();
    el.deleteDialog.close();
  } catch (err) {
    setMessage(`Delete failed: ${err.message}`, 'error');
  }
});

loadAllData();
