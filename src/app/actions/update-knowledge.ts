"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import {
  parseFaqData,
  toFaqJsonb,
  type FaqPair,
} from "@/lib/knowledge/faq-data";
import type { Database } from "@/types/database.types";

export type KnowledgeActionResult =
  | { ok: true; items: FaqPair[] }
  | { ok: false; error: string };

function getPocUserId(): string | null {
  const raw = process.env.POC_SAVE_AGENT_USER_ID?.trim();
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    raw,
  )
    ? raw
    : null;
}

type WriteCtx =
  | { mode: "poc"; client: ReturnType<typeof createServiceRoleClient<Database>>; userId: string }
  | { mode: "session"; client: ReturnType<typeof createClient>; userId: string };

async function getWriteContext(): Promise<WriteCtx | null> {
  const pocUserId = getPocUserId();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (pocUserId && serviceKey) {
    const client = createServiceRoleClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
    return { mode: "poc", client, userId: pocUserId };
  }
  const client = createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return null;
  return { mode: "session", client, userId: user.id };
}

async function readFaqPairs(ctx: WriteCtx): Promise<FaqPair[]> {
  const { data, error } = await ctx.client
    .from("agents")
    .select("faq_data")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error || !data) return [];
  return parseFaqData(data.faq_data);
}

async function writeFaqPairs(ctx: WriteCtx, pairs: FaqPair[]): Promise<KnowledgeActionResult> {
  const json = toFaqJsonb(pairs);
  const { error } = await ctx.client
    .from("agents")
    .update({ faq_data: json })
    .eq("user_id", ctx.userId);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/knowledge");
  revalidatePath("/onboarding");
  return { ok: true, items: pairs };
}

export async function updateKnowledgePair(
  index: number,
  question: string,
  answer: string,
): Promise<KnowledgeActionResult> {
  const ctx = await getWriteContext();
  if (!ctx) {
    return { ok: false, error: "Non authentifié ou agent introuvable." };
  }
  const pairs = await readFaqPairs(ctx);
  if (index < 0 || index >= pairs.length) {
    return { ok: false, error: "Index invalide." };
  }
  pairs[index] = { question: question.trim(), answer: answer.trim() };
  return writeFaqPairs(ctx, pairs);
}

export async function addKnowledgePair(
  question: string,
  answer: string,
): Promise<KnowledgeActionResult> {
  const ctx = await getWriteContext();
  if (!ctx) {
    return { ok: false, error: "Non authentifié ou agent introuvable." };
  }
  const pairs = await readFaqPairs(ctx);
  pairs.push({
    question: question.trim(),
    answer: answer.trim(),
  });
  return writeFaqPairs(ctx, pairs);
}

export async function deleteKnowledgePair(index: number): Promise<KnowledgeActionResult> {
  const ctx = await getWriteContext();
  if (!ctx) {
    return { ok: false, error: "Non authentifié ou agent introuvable." };
  }
  const pairs = await readFaqPairs(ctx);
  if (index < 0 || index >= pairs.length) {
    return { ok: false, error: "Index invalide." };
  }
  pairs.splice(index, 1);
  return writeFaqPairs(ctx, pairs);
}

/** Remplace tout le tableau (utile pour synchroniser après plusieurs éditions locales). */
export async function replaceKnowledgeFaq(
  items: FaqPair[],
): Promise<KnowledgeActionResult> {
  const ctx = await getWriteContext();
  if (!ctx) {
    return { ok: false, error: "Non authentifié ou agent introuvable." };
  }
  const cleaned = items.map((p) => ({
    question: p.question.trim(),
    answer: p.answer.trim(),
  }));
  return writeFaqPairs(ctx, cleaned);
}
