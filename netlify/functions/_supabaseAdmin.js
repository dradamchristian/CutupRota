import { createClient } from '@supabase/supabase-js';

export function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRole) {
    throw new Error('Missing required Supabase environment variables.');
  }

  return createClient(url, serviceRole, {
    auth: { persistSession: false }
  });
}

export function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

export function parseBody(event) {
  return event.body ? JSON.parse(event.body) : {};
}
