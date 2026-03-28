const ACTIVE_KEYS = ['active', 'is_active', 'enabled'];

function pickActiveValue(bench) {
  for (const key of ACTIVE_KEYS) {
    if (typeof bench?.[key] === 'boolean') return bench[key];
  }
  return true;
}

export function normalizeBench(bench) {
  return {
    ...bench,
    active: pickActiveValue(bench),
    _activeKey: ACTIVE_KEYS.find((key) => Object.prototype.hasOwnProperty.call(bench, key)) || 'active'
  };
}

export function normalizeBenches(benches = []) {
  return benches.map(normalizeBench);
}

export function createBenchPayload(bench, active) {
  const payload = { ...bench };
  delete payload.active;
  delete payload._activeKey;
  payload[bench._activeKey || 'active'] = active;
  return payload;
}
