-- Contrainte d'unicité pour garantir un seul lead par (agent_id, session_id)
-- Permet de fiabiliser la logique d'UPSERT côté capture-lead.

-- Nettoyage prudent : en cas de doublons legacy, on garde la plus ancienne ligne
-- (on conserve la source d'origine, les mises à jour seront ré-appliquées par le code).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY agent_id, session_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.leads
  WHERE session_id IS NOT NULL
)
DELETE FROM public.leads l
USING ranked r
WHERE l.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS leads_agent_session_unique_idx
  ON public.leads (agent_id, session_id)
  WHERE session_id IS NOT NULL;
