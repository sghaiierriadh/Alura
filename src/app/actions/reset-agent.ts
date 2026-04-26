"use server";

import { loadMyAgent } from "@/lib/agents/server-access";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import {
  createClient as createServiceRoleClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

export type ResetAgentResult =
  | { ok: true }
  | { ok: false; error: string };

function getServiceRoleClient(): SupabaseClient<Database> | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!key || !url) return null;
  return createServiceRoleClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Réinitialise l’agent courant : profil, identité visuelle, FAQ, connaissances
 * indexées pour cet agent. Si `deleteLeads` : supprime tickets (`lead_complaints`),
 * puis `leads`, puis `messages` pour cet agent (ordre compatible FK / RLS).
 * Utilise le client **service_role** pour les suppressions si la clé est
 * définie (contourne les politiques RLS manquantes, ex. `messages` DELETE) ;
 * l’agent ciblé reste toujours celui de la session (`loadMyAgent`).
 */
export async function resetAgentAction(options: {
  deleteLeads: boolean;
}): Promise<ResetAgentResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Vous devez être connecté." };
  }

  const agent = await loadMyAgent();
  if (!agent) {
    return { ok: false, error: "Agent introuvable." };
  }

  const { error: updErr } = await supabase
    .from("agents")
    .update({
      // `company_name` peut être NOT NULL en base : chaîne vide = profil « vide »
      // pour la nav / onboarding (`isAgentConfiguredForNavigation` exige du texte non vide).
      company_name: "",
      sector: null,
      description: null,
      faq_data: null,
      website_url: null,
      chatbot_name: null,
      theme_color: null,
      welcome_message: null,
      avatar_url: null,
      api_endpoint: null,
      api_key: null,
    })
    .eq("id", agent.id)
    .eq("user_id", user.id);

  if (updErr) {
    return { ok: false, error: updErr.message };
  }

  const admin = getServiceRoleClient();
  /** Client pour DELETE : service_role si dispo (évite RLS bloquante), sinon session. */
  const del = admin ?? supabase;

  if (options.deleteLeads) {
    const { data: leadRows, error: leadSelErr } = await del
      .from("leads")
      .select("id")
      .eq("agent_id", agent.id);
    if (leadSelErr) {
      return { ok: false, error: leadSelErr.message };
    }
    const leadIds = (leadRows ?? []).map((r) => r.id);

    if (leadIds.length > 0) {
      const { error: ticketErr } = await del
        .from("lead_complaints")
        .delete()
        .in("lead_id", leadIds);
      if (ticketErr) {
        return { ok: false, error: ticketErr.message };
      }
    }

    const { error: ldErr } = await del
      .from("leads")
      .delete()
      .eq("agent_id", agent.id);
    if (ldErr) {
      return { ok: false, error: ldErr.message };
    }

    const { error: msgErr } = await del
      .from("messages")
      .delete()
      .eq("agent_id", agent.id);
    if (msgErr) {
      return { ok: false, error: msgErr.message };
    }
  }

  const { error: knErr } = await del
    .from("knowledge")
    .delete()
    .eq("agent_id", agent.id);

  if (knErr) {
    return { ok: false, error: knErr.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/onboarding");
  revalidatePath("/settings");
  revalidatePath("/knowledge");
  revalidatePath("/admin/leads");
  revalidatePath("/admin/tickets");
  revalidatePath("/chat");
  revalidatePath("/", "layout");

  return { ok: true };
}
