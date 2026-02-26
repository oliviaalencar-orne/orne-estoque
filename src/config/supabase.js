import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://ppslljqxsdsdmwfiayok.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwc2xsanF4c2RzZG13ZmlheW9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2NDUzNjQsImV4cCI6MjA4NjIyMTM2NH0.-7oJxDaw2nwc2uN410OGwavefzjZ-AjfmkK8QxpB7cM';

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
