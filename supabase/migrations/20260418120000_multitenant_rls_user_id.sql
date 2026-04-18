-- Colonne user_id sur knowledge + RLS agents + knowledge (auth.uid() = user_id).
-- À appliquer après déploiement du code qui renseigne user_id à l’insertion.

ALTER TABLE public.knowledge
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

UPDATE public.knowledge k
SET user_id = a.user_id
FROM public.agents a
WHERE k.agent_id = a.id
  AND k.user_id IS NULL;

ALTER TABLE public.knowledge ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS knowledge_user_id_idx ON public.knowledge (user_id);

-- knowledge : remplacer les politiques basées sur agents par user_id
DROP POLICY IF EXISTS "knowledge_select_own_agent" ON public.knowledge;
DROP POLICY IF EXISTS "knowledge_insert_own_agent" ON public.knowledge;
DROP POLICY IF EXISTS "knowledge_delete_own_agent" ON public.knowledge;

CREATE POLICY "knowledge_select_own_user_id"
  ON public.knowledge FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "knowledge_insert_own_user_id"
  ON public.knowledge FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "knowledge_update_own_user_id"
  ON public.knowledge FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "knowledge_delete_own_user_id"
  ON public.knowledge FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- agents : accès uniquement à sa propre ligne
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_select_own" ON public.agents;
DROP POLICY IF EXISTS "agents_insert_own" ON public.agents;
DROP POLICY IF EXISTS "agents_update_own" ON public.agents;
DROP POLICY IF EXISTS "agents_delete_own" ON public.agents;

CREATE POLICY "agents_select_own"
  ON public.agents FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "agents_insert_own"
  ON public.agents FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "agents_update_own"
  ON public.agents FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "agents_delete_own"
  ON public.agents FOR DELETE
  USING (user_id = (SELECT auth.uid()));

NOTIFY pgrst, 'reload schema';
