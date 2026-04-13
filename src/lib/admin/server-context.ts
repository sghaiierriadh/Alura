import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

function getPocUserId(): string | null {
  const raw = process.env.POC_SAVE_AGENT_USER_ID?.trim();
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    raw,
  )
    ? raw
    : null;
}

export type AdminReadCtx = {
  client: SupabaseClient<Database>;
  userId: string;
};

/** Client Supabase pour lectures dashboard (POC service role ou session JWT). */
export async function getAdminReadContext(): Promise<AdminReadCtx | null> {
  const pocUserId = getPocUserId();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (pocUserId && serviceKey) {
    const client = createServiceRoleClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
    return { client, userId: pocUserId };
  }
  const client = createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  return { client, userId: user.id };
}
