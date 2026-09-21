function sameId(left, right) {
  return String(left) === String(right);
}

export function upsertById(items = [], item) {
  if (!item?.id) return items;
  const index = items.findIndex((existing) => sameId(existing.id, item.id));
  if (index === -1) return [...items, item];
  return items.map((existing, itemIndex) => itemIndex === index ? item : existing);
}

export function removeById(items = [], id) {
  return items.filter((item) => !sameId(item.id, id));
}

export function removeByIds(items = [], ids = []) {
  const removed = new Set(ids.map(String));
  return items.filter((item) => !removed.has(String(item.id)));
}
