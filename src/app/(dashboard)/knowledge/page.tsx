import { loadMyAgent } from "@/lib/agents/server-access";
import { parseFaqData } from "@/lib/knowledge/faq-data";
import { redirect } from "next/navigation";

import { KnowledgeView } from "./knowledge-view";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const agent = await loadMyAgent();
  if (!agent) {
    redirect("/onboarding");
  }

  const initialFaq = parseFaqData(agent.faq_data);

  return (
    <KnowledgeView
      companyName={agent.company_name ?? "—"}
      description={agent.description ?? ""}
      initialFaq={initialFaq}
    />
  );
}
