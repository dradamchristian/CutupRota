function parseId(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

function normalizeTimeValue(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text) return null;

  const timeSource = text.includes('T') ? text.split('T').at(-1) : text;
  const match = timeSource.match(/^(\d{2}):(\d{2})/);
  if (!match) return text;
  return `${match[1]}:${match[2]}`;
}

function inferBlockType(block) {
  if (block?.block_type === 'date' || block?.block_type === 'weekday') return block.block_type;
  if (block?.type === 'date' || block?.type === 'weekday') return block.type;
  if (block?.block_date) return 'date';
  if (block?.weekday === 0 || block?.weekday) return 'weekday';
  return 'weekday';
}

export function normalizeBlockedPeriod(block) {
  const blockType = inferBlockType(block);
  return {
    ...block,
    block_type: blockType,
    block_date: blockType === 'date' ? (block.block_date || null) : null,
    weekday: blockType === 'weekday' ? (block.weekday === '' || block.weekday == null ? null : Number(block.weekday)) : null,
    bench_id: parseId(block.bench_id),
    start_time: normalizeTimeValue(block.start_time),
    end_time: normalizeTimeValue(block.end_time)
  };
}

export function normalizeBlockedPeriods(blockedPeriods = []) {
  return blockedPeriods.map(normalizeBlockedPeriod);
}
