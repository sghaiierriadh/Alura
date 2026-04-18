import { createClient } from "@/lib/supabase/server";

import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminReadCtx = {
  client: SupabaseClient<Database>;
  userId: string;
};

/** Client Supabase pour lectures dashboard (session JWT). */
export async function getAdminReadContext(): Promise<AdminReadCtx | null> {
  const client = createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  return { client, userId: user.id };
}
