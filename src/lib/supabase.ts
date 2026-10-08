import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
  'https://avtkzutofgsjzldkimro.supabase.co';

const SUPABASE_KEY =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_JWT_ANON)) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2dGt6dXRvZmdzanpsZGtpbXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NjA1NzQsImV4cCI6MjEwNzAzNjU3NH0.uf4qQfLCpBToJ7Vz_FSspcJj7rjRJYwVdLUcdiMZva0';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

export const isSupabaseConfigured = (): boolean => {
  return Boolean(SUPABASE_KEY && SUPABASE_KEY !== 'placeholder-key');
};

/**
 * Health check to verify live Supabase connectivity.
 */
export async function checkSupabaseConnection(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('projects').select('id').limit(1);
    // PGRST116, 42P01, PGRST205 confirm valid authentication with Supabase API gateway
    return {
      connected: !error || error.code === 'PGRST116' || error.code === '42P01' || error.code === 'PGRST205',
      latencyMs: Date.now() - start,
      error: error?.message,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err?.message || 'Unknown network error',
    };
  }
}
