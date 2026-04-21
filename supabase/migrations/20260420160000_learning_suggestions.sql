-- Suggestions d'apprentissage semi-auto (ex. après live search réussi).
CREATE TABLE public.learning_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'rejected')),
  user_question text NOT NULL,
  suggested_answer text NOT NULL,
  source text NOT NULL DEFAULT 'live_search',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX learning_suggestions_agent_pending_idx
  ON public.learning_suggestions (agent_id)
  WHERE status = 'pending';

ALTER TABLE public.learning_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY learning_suggestions_select_own
  ON public.learning_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = learning_suggestions.agent_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY learning_suggestions_update_own
  ON public.learning_suggestions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = learning_suggestions.agent_id AND a.user_id = auth.uid()
    )
  );
