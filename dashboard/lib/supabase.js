/**
 * Supabase client configuration for LeadGenRentalsHQ.
 *
 * Usage (browser):
 *   import { supabase } from './lib/supabase.js';
 *
 * The anon key is safe to expose - Row Level Security enforces access.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tgujjtllrrhpwkcmmqap.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndWpqdGxscnJocHdrY21tcWFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDIwNTksImV4cCI6MjA5OTk3ODA1OX0.Fu31FBRmqXXc14hjABpmKU0ctlj1CX8fgVhDYZ4yjJA';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
