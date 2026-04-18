-- RLS sur lead_complaints : insertion publique (widget) + lecture / mise à jour pour le propriétaire de l’agent.

ALTER TABLE public.lead_complaints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert for leads" ON public.lead_complaints;
DROP POLICY IF EXISTS "lead_complaints_select_own_agent" ON public.lead_complaints;
DROP POLICY IF EXISTS "lead_complaints_update_own_agent" ON public.lead_complaints;

CREATE POLICY "Allow public insert for leads"
  ON public.lead_complaints FOR INSERT
  WITH CHECK (true);

CREATE POLICY "lead_complaints_select_own_agent"
  ON public.lead_complaints FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      INNER JOIN public.agents a ON a.id = l.agent_id
      WHERE l.id = lead_complaints.lead_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lead_complaints_update_own_agent"
  ON public.lead_complaints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      INNER JOIN public.agents a ON a.id = l.agent_id
      WHERE l.id = lead_complaints.lead_id
        AND a.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      INNER JOIN public.agents a ON a.id = l.agent_id
      WHERE l.id = lead_complaints.lead_id
        AND a.user_id = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
