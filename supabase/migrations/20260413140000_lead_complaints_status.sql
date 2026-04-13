-- Statut ticket : ouvert / résolu (exécuter sur le projet Supabase si la colonne n’existe pas encore)
ALTER TABLE public.lead_complaints
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_complaints_status_check'
  ) THEN
    ALTER TABLE public.lead_complaints
      ADD CONSTRAINT lead_complaints_status_check
      CHECK (status IN ('open', 'resolved'));
  END IF;
END $$;
