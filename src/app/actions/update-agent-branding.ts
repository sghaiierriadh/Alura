"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type UpdateAgentBrandingResult =
  | {
      ok: true;
      data: {
        chatbotName: string;
        themeColor: string;
        welcomeMessage: string;
        avatarUrl: string | null;
      };
    }
  | { ok: false; error: string };

function normalizeHexColor(raw: string | null): string {
  const fallback = "#18181b";
  const value = (raw ?? "").trim();
  if (!value) return fallback;
  const withHash = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash : fallback;
}

export async function updateAgentBranding(
  formData: FormData,
): Promise<UpdateAgentBrandingResult> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Vous devez être connecté pour modifier le branding." };
  }

  const chatbotName = String(formData.get("chatbot_name") ?? "").trim();
  const welcomeMessage = String(formData.get("welcome_message") ?? "").trim();
  const themeColor = normalizeHexColor(
    String(formData.get("theme_color") ?? "").trim(),
  );
  const previousAvatarUrlRaw = String(formData.get("previous_avatar_url") ?? "").trim();

  if (!chatbotName) {
    return { ok: false, error: "Le nom du chatbot est requis." };
  }
  if (!welcomeMessage) {
    return { ok: false, error: "Le message de bienvenue est requis." };
  }

  const { data: agentRow, error: agentErr } = await supabase
    .from("agents")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (agentErr || !agentRow?.id) {
    return { ok: false, error: "Agent introuvable pour cet utilisateur." };
  }

  const avatarFile = formData.get("avatar");
  let avatarUrl: string | null = previousAvatarUrlRaw || null;

  if (avatarFile instanceof File && avatarFile.size > 0) {
    const allowed = new Set(["image/png", "image/jpeg", "image/webp"]);
    if (!allowed.has(avatarFile.type)) {
      return { ok: false, error: "Formats autorisés : PNG, JPG, WEBP." };
    }
    if (avatarFile.size > 4 * 1024 * 1024) {
      return { ok: false, error: "Image trop lourde (max 4 Mo)." };
    }

    const ext =
      avatarFile.type === "image/png"
        ? "png"
        : avatarFile.type === "image/webp"
          ? "webp"
          : "jpg";
    const filePath = `${agentRow.id}/avatar-${Date.now()}.${ext}`;
    const bytes = await avatarFile.arrayBuffer();
    const { error: uploadErr } = await supabase.storage
      .from("agent-assets")
      .upload(filePath, bytes, {
        contentType: avatarFile.type,
        upsert: true,
      });
    if (uploadErr) {
      return { ok: false, error: `Upload avatar impossible: ${uploadErr.message}` };
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("agent-assets").getPublicUrl(filePath);
    avatarUrl = publicUrl || null;
  }

  const payload = {
    chatbot_name: chatbotName,
    theme_color: themeColor,
    welcome_message: welcomeMessage,
    avatar_url: avatarUrl,
  };

  const { error: updateErr } = await supabase
    .from("agents")
    .update(payload as never)
    .eq("id", agentRow.id)
    .eq("user_id", user.id);

  if (updateErr) {
    return { ok: false, error: updateErr.message };
  }

  revalidatePath("/settings");
  revalidatePath("/widget");
  revalidatePath("/embed");

  return {
    ok: true,
    data: {
      chatbotName,
      themeColor,
      welcomeMessage,
      avatarUrl,
    },
  };
}
