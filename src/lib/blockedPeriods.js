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
    bench_id: block.bench_id == null || block.bench_id === '' ? null : Number(block.bench_id)
  };
}

export function normalizeBlockedPeriods(blockedPeriods = []) {
  return blockedPeriods.map(normalizeBlockedPeriod);
}
