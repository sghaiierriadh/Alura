-- API Expert : endpoint et clé optionnels pour appels POST côté serveur (outil Gemini).
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS api_endpoint text;

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS api_key text;
