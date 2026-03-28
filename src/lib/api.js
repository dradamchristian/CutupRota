const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function netlifyCall(path, payload) {
  const response = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}

export function verifyAdminPin(pin) {
  return netlifyCall('verify-admin-pin', { pin });
}

export function updateSettings(payload) {
  return netlifyCall('update-settings', payload);
}

export function saveBench(payload) {
  return netlifyCall('benches', payload);
}

export function saveBlockedPeriod(payload) {
  return netlifyCall('blocked-periods', payload);
}
