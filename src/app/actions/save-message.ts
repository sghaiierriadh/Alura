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

function getPocUserId(): string | null {
  const raw = process.env.POC_SAVE_AGENT_USER_ID?.trim();
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    raw,
  )
    ? raw
    : null;
}

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

  const pocUserId = getPocUserId();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (pocUserId && serviceKey) {
    const admin = createServiceRoleClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );

    const { data: ownedAgent, error: ownedAgentError } = await admin
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", pocUserId)
      .maybeSingle();

    if (ownedAgentError || !ownedAgent) {
      return { ok: false, error: "Agent introuvable." };
    }

    const { error } = await admin.from("messages").insert({
      session_id: sessionId,
      agent_id: agentId,
      role: input.role,
      content,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  }

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Vous devez être connecté." };
  }

  const { data: ownedAgent, error: ownedAgentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ownedAgentError || !ownedAgent) {
    return { ok: false, error: "Agent introuvable." };
  }

  const { error } = await supabase.from("messages").insert({
    session_id: sessionId,
    agent_id: agentId,
    role: input.role,
    content,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
