/**
 * Supabase client configuration for LeadGenRentalsHQ.
 *
 * Usage (browser):
 *   import { supabase } from './lib/supabase.js';
 *
 * The anon key is safe to expose - Row Level Security enforces access.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = '__LGR_HQ_SUPABASE_URL__';
const supabaseAnonKey =
  '__LGR_HQ_ANON_KEY__';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
