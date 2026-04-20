-- URL du site client (domaine ou URL complète) pour recherche ciblée (live search).
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS website_url text;
