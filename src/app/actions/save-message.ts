"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

export type SaveMessageInput = {
  sessionId: string;
  agentId: string;
  role: "user" | "assistant";
  content: string;
};

export type SaveMessageResult = { ok: true } | { ok: false; error: string };

export async function saveMessage(input: SaveMessageInput): Promise<SaveMessageResult> {
  const sessionId = input.sessionId.trim();
  const agentId = input.agentId.trim();
  const content = input.content.trim();

  if (!sessionId) {
    return { ok: false, error: "sessionId requis." };
  }
  if (!agentId) {
    return { ok: false, error: "agentId requis." };
  }
  if (!content) {
    return { ok: false, error: "content requis." };
  }
  if (input.role !== "user" && input.role !== "assistant") {
    return { ok: false, error: "role invalide." };
  }

  const row = {
    session_id: sessionId,
    agent_id: agentId,
    role: input.role,
    content,
  };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: ownedAgent, error: ownedAgentError } = await supabase
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (ownedAgentError || !ownedAgent) {
      return { ok: false, error: "Agent introuvable." };
    }

    const { error } = await supabase.from("messages").insert(row);
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return { ok: false, error: "Vous devez être connecté." };
  }

  const admin = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  const { data: agent, error: agentErr } = await admin
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();

  if (agentErr || !agent) {
    return { ok: false, error: "Agent introuvable." };
  }

  const { error } = await admin.from("messages").insert(row);
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
