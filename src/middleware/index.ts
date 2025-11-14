import { defineMiddleware } from "astro:middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../db/database.types";

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const onRequest = defineMiddleware(async (context, next) => {
  // Sprawdź token z Authorization header (dla API requests)
  const authHeader = context.request.headers.get("Authorization");
  let token = authHeader?.replace("Bearer ", "");

  // Jeśli brak Authorization header, sprawdź cookies (dla SSR pages)
  if (!token) {
    token = context.cookies.get("rentflow_auth_token")?.value;
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  let user = null;
  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      user = data.user;
    }
  }

  context.locals.supabase = supabase;
  context.locals.user = user;

  return next();
});
