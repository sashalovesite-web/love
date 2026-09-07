import { createClient } from '@supabase/supabase-js';

// Твой URL из предыдущих скриншотов
const SUPABASE_URL = 'https://hmtizxlndfymokmxfroz.supabase.co';
// ВСТАВЬ СЮДА СВОЙ ПОЛНЫЙ ANON KEY (длинная строка из Supabase)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdGl6eGxuZGZ5bW9rbXhmcm96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczOTY2NzUsImV4cCI6MjEwMjk3MjY3NX0.0IvN9c00xKJvpTJpSweQVKdueHw4Yq7ZUQq-4KLCsgA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const isSupabaseConfigured = () => {
    return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 10;
};