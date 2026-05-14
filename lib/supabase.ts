import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ncbzklntlyiqvpmezpnk.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_OsNM8K_bgwUQhGosWMrCfA_Lt4k93DL";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
