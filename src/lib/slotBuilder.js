import { combineDateTime, minutesToTime, parseTimeToMinutes } from './date.js';

function overlaps(rangeA, rangeB) {
  return rangeA.start < rangeB.end && rangeA.end > rangeB.start;
}

function idsMatch(left, right) {
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

export function getEnabledDurations(settings) {
  const preferred = [30, 45, 60, 75, 90, 105, 120];
  const enabled = preferred.filter((minutes) => settings[`allow_${minutes}`] === true);
  return enabled.length ? enabled : preferred;
}

export function normalizeBlockedForDate(blockedPeriods, dateKey, benchId) {
  return blockedPeriods.filter((block) => {
    const blockBenchId = block.bench_id == null ? null : block.bench_id;
    const benchMatches = blockBenchId == null || idsMatch(blockBenchId, benchId);
    if (!benchMatches) return false;

    const blockType = block.block_type || (block.block_date ? 'date' : 'weekday');

    // "weekday" blocks are treated as recurring every day.
    if (blockType === 'weekday') return true;

    if (blockType === 'date') {
      return block.block_date === dateKey;
    }

    return false;
  });
}

export function buildDayBlocks({ dateKey, benchId, bookings, blockedPeriods, settings }) {
  const startMins = parseTimeToMinutes(settings.default_start_time);
  const endMins = parseTimeToMinutes(settings.default_end_time);
  const interval = Number(settings.slot_interval_minutes);

  const dayBookings = bookings
    .filter((b) => idsMatch(b.bench_id, benchId) && b.start_at.startsWith(dateKey))
    .map((b) => ({
      kind: 'booked',
      id: b.id,
      start: new Date(b.start_at),
      end: new Date(b.end_at),
      booking: b
    }));

  const dayBlocked = normalizeBlockedForDate(blockedPeriods, dateKey, benchId)
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

    if (dayBookings.some((x) => overlaps({ start: slotStart, end: slotEnd }, x))) {
      status = 'booked';
    }
    if (dayBlocked.some((x) => overlaps({ start: slotStart, end: slotEnd }, x))) {
      status = 'blocked';
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
