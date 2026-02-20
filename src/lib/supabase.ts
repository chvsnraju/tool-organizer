import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isProduction = import.meta.env.PROD;

const isLocalSupabaseUrl = (url?: string) => {
  if (!url) return false;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
};

if (isProduction && isLocalSupabaseUrl(supabaseUrl)) {
  throw new Error('Invalid VITE_SUPABASE_URL for production: localhost URLs are not allowed. Use your Supabase cloud project URL.');
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
