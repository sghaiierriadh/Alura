"use server";

import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import type { Database } from "@/types/database.types";

type SendLeadAlertInput = {
  agentId: string;
  leadId: string;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  lastQuestion?: string | null;
  dashboardLeadUrl?: string | null;
};

function clean(value?: string | null): string {
  return (value ?? "").trim();
}

function escHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendLeadAlertEmail(
  input: SendLeadAlertInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) return { ok: false, error: "RESEND_API_KEY manquante." };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) {
    return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY manquante." };
  }

  const admin = createServiceRoleClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  const agentId = clean(input.agentId);
  if (!agentId) return { ok: false, error: "agentId requis." };

  const { data: agentRow, error: agentErr } = await admin
    .from("agents")
    .select("id, company_name, user_id")
    .eq("id", agentId)
    .maybeSingle();

  if (agentErr || !agentRow?.id) {
    return { ok: false, error: "Agent introuvable." };
  }

  const owner = await admin.auth.admin.getUserById(agentRow.user_id);
  const ownerEmail = clean(owner.data.user?.email);
  if (!ownerEmail) {
    return { ok: false, error: "Email propriétaire introuvable." };
  }

  const resend = new Resend(resendKey);
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "Alura <onboarding@resend.dev>";

  const leadName = clean(input.fullName) || "Non renseigné";
  const leadEmail = clean(input.email) || "Non renseigné";
  const leadPhone = clean(input.phone) || "Non renseigné";
  const source = clean(input.source) || "widget";
  const question = clean(input.lastQuestion) || "Aucune question capturée";
  const company = clean(agentRow.company_name) || "Votre entreprise";
  const leadId = clean(input.leadId);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "").trim() || "http://localhost:3000";
  const dashboardLeadUrl =
    clean(input.dashboardLeadUrl) ||
    `${appUrl}/admin/leads?leadId=${encodeURIComponent(leadId)}`;

  const subject = `Nouveau lead Alura - ${company}`;

  const html = `
  <div style="background:#0b1020;padding:28px;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:20px 24px;">
        <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#93c5fd;">Alura Lead Alert</div>
        <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:#ffffff;">Nouveau lead capturé</h1>
      </div>
      <div style="padding:22px 24px;">
        <p style="margin:0 0 14px;color:#334155;">Un nouveau contact a été enregistré depuis votre assistant Alura.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tbody>
            <tr><td style="padding:8px 0;color:#64748b;">Entreprise</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${escHtml(company)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Lead ID</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${escHtml(leadId)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Nom</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${escHtml(leadName)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Email</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${escHtml(leadEmail)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Téléphone</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${escHtml(leadPhone)}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;">Source</td><td style="padding:8px 0;font-weight:600;color:#0f172a;">${escHtml(source)}</td></tr>
          </tbody>
        </table>
        <div style="margin-top:16px;padding:14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;">
          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;">Dernière question</div>
          <div style="font-size:14px;color:#0f172a;line-height:1.5;">${escHtml(question)}</div>
        </div>
        <div style="margin-top:18px;">
          <a href="${escHtml(dashboardLeadUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:600;">
            Ouvrir le lead dans le dashboard
          </a>
        </div>
      </div>
    </div>
  </div>`;

  try {
    await resend.emails.send({
      from,
      to: [ownerEmail],
      subject,
      html,
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur Resend";
    return { ok: false, error: message };
  }
}
