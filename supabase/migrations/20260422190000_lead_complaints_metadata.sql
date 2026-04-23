-- Metadata timeline pour les tickets (réclamations) :
--   {
--     "handled": [0, 2, 3],          -- indices de blocs timeline marqués « Traité »
--     "internal_note": "brouillon",  -- note interne / réponse à préparer
--     "promoted": [0, 2]             -- indices déjà publiés dans la connaissance
--   }
-- Stockage JSONB pour évolutivité (ajout futur d'annotations sans migration).

ALTER TABLE public.lead_complaints
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS lead_complaints_metadata_gin_idx
  ON public.lead_complaints
  USING gin (metadata);
