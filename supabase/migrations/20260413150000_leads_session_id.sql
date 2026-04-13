-- Lie un lead à la session de chat (pour afficher l’historique messages côté admin)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS session_id text;

CREATE INDEX IF NOT EXISTS leads_session_id_idx ON public.leads (session_id)
  WHERE session_id IS NOT NULL;
