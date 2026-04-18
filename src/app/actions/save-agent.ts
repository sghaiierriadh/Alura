"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export type SaveAgentSuccess = { ok: true };
export type SaveAgentFailure = { ok: false; error: string };
export type SaveAgentResult = SaveAgentSuccess | SaveAgentFailure;

export type SaveAgentInput = {
  companyName: string;
  sector: string;
  description: string;
  faqHighlights: string[];
};

export async function saveAgent(input: SaveAgentInput): Promise<SaveAgentResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      if (process.env.NODE_ENV === "development") {
        const store = await cookies();
        const all = store.getAll();
        const hasSbAuth = all.some(
          (c) =>
            c.name.startsWith("sb-") && c.name.includes("-auth-token"),
        );
        console.warn("[saveAgent] diagnostic session", {
          cookieCount: all.length,
          hasSupabaseAuthCookie: hasSbAuth,
          authErrorMessage: authError?.message ?? null,
          authErrorStatus: authError?.status ?? null,
          userPresent: Boolean(user),
        });
      }

      const parts = ["Vous devez être connecté pour enregistrer votre agent."];
      if (authError?.message) {
        parts.push(`(${authError.message})`);
      } else if (!user) {
        parts.push(
          "(Aucune session : pas d’utilisateur JWT côté serveur — cookies Supabase absents, expirés ou jamais émis après connexion.)",
        );
      }
      return {
        ok: false,
        error: parts.join(" "),
      };
    }

    const { error } = await supabase.from("agents").upsert(
      {
        user_id: user.id,
        company_name: input.companyName,
        sector: input.sector,
        description: input.description,
        faq_data: input.faqHighlights,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/dashboard");
    revalidatePath("/onboarding");
    return { ok: true };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur lors de l’enregistrement.";
    return { ok: false, error: message };
  }
}
