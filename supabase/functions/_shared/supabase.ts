// Cliente com credencial de serviço (ignora RLS). Usar só dentro das funções.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

export type Db = SupabaseClient<Database>;

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`variável de ambiente ausente: ${name}`);
  return value;
}

export function createServiceClient(): Db {
  return createClient<Database>(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
