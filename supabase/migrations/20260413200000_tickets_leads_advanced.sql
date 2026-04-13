-- Tickets : notes de résolution, priorité, statut « en cours »
ALTER TABLE public.lead_complaints
  ADD COLUMN IF NOT EXISTS resolution_notes text;

ALTER TABLE public.lead_complaints
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

ALTER TABLE public.lead_complaints DROP CONSTRAINT IF EXISTS lead_complaints_priority_check;
ALTER TABLE public.lead_complaints
  ADD CONSTRAINT lead_complaints_priority_check
  CHECK (priority IN ('low', 'normal', 'high'));

ALTER TABLE public.lead_complaints DROP CONSTRAINT IF EXISTS lead_complaints_status_check;
UPDATE public.lead_complaints SET status = 'open' WHERE status IS NULL OR status NOT IN ('open', 'in_progress', 'resolved');
ALTER TABLE public.lead_complaints
  ADD CONSTRAINT lead_complaints_status_check
  CHECK (status IN ('open', 'in_progress', 'resolved'));

-- Leads : source (widget, embed, dashboard, …)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IN ('widget', 'embed', 'dashboard', 'api', 'unknown'));
