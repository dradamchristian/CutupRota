import { combineDateTime, minutesToTime, parseTimeToMinutes, weekdayIndex } from './date.js';

function overlaps(rangeA, rangeB) {
  return rangeA.start < rangeB.end && rangeA.end > rangeB.start;
}

export function getEnabledDurations(settings) {
  const allowed = [];
  if (settings.allow_30) allowed.push(30);
  if (settings.allow_60) allowed.push(60);
  if (settings.allow_90) allowed.push(90);
  if (settings.allow_120) allowed.push(120);
  return allowed;
}

export function normalizeBlockedForDate(blockedPeriods, dateKey, dayIndex, benchId) {
  return blockedPeriods.filter((block) => {
    const benchMatches = !block.bench_id || block.bench_id === benchId;
    if (!benchMatches) return false;

    if (block.block_type === 'weekday') {
      return Number(block.weekday) === dayIndex;
    }

    if (block.block_type === 'date') {
      return block.block_date === dateKey;
    }

    return false;
  });
}

export function buildDayBlocks({ dateKey, benchId, bookings, blockedPeriods, settings }) {
  const dayIndex = weekdayIndex(new Date(`${dateKey}T00:00:00`));
  const startMins = parseTimeToMinutes(settings.default_start_time);
  const endMins = parseTimeToMinutes(settings.default_end_time);
  const interval = Number(settings.slot_interval_minutes);

  const dayBookings = bookings
    .filter((b) => b.bench_id === benchId && b.start_at.startsWith(dateKey))
    .map((b) => ({
      kind: 'booked',
      id: b.id,
      start: new Date(b.start_at),
      end: new Date(b.end_at),
      booking: b
    }));

  const dayBlocked = normalizeBlockedForDate(blockedPeriods, dateKey, dayIndex, benchId)
    .map((b) => ({
      kind: 'blocked',
      id: b.id,
      start: combineDateTime(dateKey, b.start_time),
      end: combineDateTime(dateKey, b.end_time),
      blocked: b
    }));

  const staticBlocks = [...dayBookings, ...dayBlocked].sort((a, b) => a.start - b.start);

  const slots = [];
  for (let m = startMins; m + interval <= endMins; m += interval) {
    const slotStart = combineDateTime(dateKey, minutesToTime(m));
    const slotEnd = combineDateTime(dateKey, minutesToTime(m + interval));
    let status = 'free';

    if (dayBlocked.some((x) => overlaps({ start: slotStart, end: slotEnd }, x))) {
      status = 'blocked';
    }
    if (dayBookings.some((x) => overlaps({ start: slotStart, end: slotEnd }, x))) {
      status = 'booked';
    }

    slots.push({
      status,
      start: slotStart,
      end: slotEnd
    });
  }

  return { slots, blocks: staticBlocks, workingRange: { startMins, endMins } };
}

export function canBookAt({ start, durationMins, staticBlocks, workEnd }) {
  const end = new Date(start.getTime() + (durationMins * 60000));
  if (end > workEnd) return false;

  const candidate = { start, end };
  return !staticBlocks.some((x) => overlaps(candidate, x));
}
