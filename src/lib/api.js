const JSON_HEADERS = { 'Content-Type': 'application/json' };

function getFunctionBases() {
  if (typeof window === 'undefined') {
    return ['/api', '/.netlify/functions'];
  }

  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return ['/api', '/.netlify/functions'];
  }

  return ['/.netlify/functions', '/api'];
}

async function netlifyCall(path, payload) {
  const body = JSON.stringify(payload);
  const bases = getFunctionBases();
  let lastError = null;

  for (const base of bases) {
    const url = `${base}/${path}`;

    console.info('[api] Request starting', { url, payload });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: JSON_HEADERS,
        body
      });

      const data = await response.json().catch(() => ({}));
      console.info('[api] Request completed', { url, status: response.status, ok: response.ok, data });

      if (!response.ok) {
        const error = new Error(data.error || `Request failed: ${response.status}`);
        const isNotFound = response.status === 404;
        if (isNotFound && base !== bases.at(-1)) {
          console.warn('[api] Endpoint returned 404, trying fallback URL', { attemptedUrl: url });
          lastError = error;
          continue;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[api] Request failed', { url, error });
      lastError = error;
      if (base === bases.at(-1)) throw error;
    }
  }

  throw lastError || new Error('Request failed');
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

export function saveBooking(payload) {
  return netlifyCall('bookings', payload);
}
