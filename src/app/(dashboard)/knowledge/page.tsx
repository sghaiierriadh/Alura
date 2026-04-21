import { loadMyAgent } from "@/lib/agents/server-access";
import { fetchBusinessRecordsForAgent } from "@/lib/knowledge/fetch-business-records";
import { fetchHumanResolutionKnowledge } from "@/lib/knowledge/fetch-human-resolution";
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
  const learnedFromTickets = await fetchHumanResolutionKnowledge(agent.id);
  const businessRecords = await fetchBusinessRecordsForAgent(agent.id);

  return (
    <KnowledgeView
      agentId={agent.id}
      companyName={agent.company_name ?? "—"}
      description={agent.description ?? ""}
      initialFaq={initialFaq}
      learnedFromTickets={learnedFromTickets}
      businessRecords={businessRecords}
    />
  );
}
