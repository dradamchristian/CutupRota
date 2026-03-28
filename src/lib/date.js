export function parseTimeToMinutes(timeText) {
  const [h, m] = String(timeText).split(':').map(Number);
  return (h * 60) + m;
}

export function minutesToTime(minutes) {
  const safe = Math.max(0, minutes);
  const h = String(Math.floor(safe / 60)).padStart(2, '0');
  const m = String(safe % 60).padStart(2, '0');
  return `${h}:${m}`;
}

export function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

export function formatDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function combineDateTime(dateKey, hhmm) {
  return new Date(`${dateKey}T${hhmm}:00`);
}

export function weekdayIndex(dateObj) {
  return dateObj.getDay();
}

export function buildVisibleDates({ daysAhead, weekendsEnabled, startOffset = 0 }) {
  const result = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  let skipped = 0;
  while (result.length < daysAhead) {
    const target = new Date(cursor);
    target.setDate(cursor.getDate() + skipped + startOffset);
    skipped += 1;

    const day = target.getDay();
    if (!weekendsEnabled && (day === 0 || day === 6)) continue;

    result.push(target);
  }

  return result;
}
