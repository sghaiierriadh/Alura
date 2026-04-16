-- Base de connaissance structurée + embeddings (RAG). Nécessite l’extension `vector` (activée par défaut sur Supabase).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents (id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  source text NOT NULL DEFAULT 'human_resolution',
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_agent_id_idx ON public.knowledge (agent_id);

ALTER TABLE public.knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_select_own_agent"
  ON public.knowledge FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = knowledge.agent_id AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "knowledge_insert_own_agent"
  ON public.knowledge FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = knowledge.agent_id AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "knowledge_delete_own_agent"
  ON public.knowledge FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = knowledge.agent_id AND a.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.match_knowledge (
  p_agent_id uuid,
  query_embedding text,
  match_count int DEFAULT 5
)
RETURNS TABLE (question text, answer text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT k.question, k.answer
  FROM public.knowledge k
  WHERE k.agent_id = p_agent_id
    AND k.embedding IS NOT NULL
  ORDER BY k.embedding <=> query_embedding::vector(768)
  LIMIT LEAST(GREATEST(match_count, 1), 20);
$$;

GRANT EXECUTE ON FUNCTION public.match_knowledge (uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge (uuid, text, int) TO service_role;
