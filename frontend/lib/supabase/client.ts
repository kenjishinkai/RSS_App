import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * URL と鍵が両方そろっているか。
 * そろっていないときは、画面に設定の案内を出します。
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * ブラウザから Supabase へつなぐ窓口。
 * アプリの中ではこの1つを使い回します。
 * 例えるなら、新聞社への専用電話を1台だけ置いて、何度もかけ直すイメージです。
 */
export const supabase: SupabaseClient<Database> | null =
  supabaseUrl && supabaseAnonKey
    ? createClient<Database>(supabaseUrl, supabaseAnonKey)
    : null;
