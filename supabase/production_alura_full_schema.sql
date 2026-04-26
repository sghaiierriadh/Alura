-- =============================================================================
-- Alura — script SQL de bootstrap production (schema public)
-- Exécuter une fois dans le SQL Editor d'un nouveau projet Supabase.
-- Les doublons de tickets / logique d'upsert par session sont gérés côté
-- application (Server Actions) + index unique (agent_id, session_id) sur leads.
-- Il n'existe pas de trigger métier « anti-doublon ticket » en base : aligné repo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Extensions
-- -----------------------------------------------------------------------------

create extension if not exists pgcrypto; -- gen_random_uuid() (selon version PG)
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- -----------------------------------------------------------------------------
-- 2) Types ENUM (valeurs alignées sur les CHECK / le code applicatif)
-- -----------------------------------------------------------------------------

do $$ begin
  create type public.complaint_status as enum ('open', 'in_progress', 'resolved');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.complaint_priority as enum ('low', 'normal', 'high');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.lead_source as enum (
    'widget',
    'embed',
    'dashboard',
    'api',
    'unknown'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.learning_suggestion_status as enum (
    'pending',
    'validated',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.chat_message_role as enum ('user', 'assistant');
exception when duplicate_object then null;
end $$;

-- Sources knowledge (sauvegarde / boost dashboard sur human_resolution)
do $$ begin
  create type public.knowledge_source as enum (
    'human_resolution',
    'template_upload',
    'document_reorganized',
    'website_scraping',
    'live_search'
  );
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- 3) Utilitaires : timestamp updated_at
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Table agents
-- -----------------------------------------------------------------------------

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  company_name text,
  sector text,
  description text,
  faq_data jsonb,
  website_url text,
  api_endpoint text,
  api_key text,
  chatbot_name text,
  theme_color text,
  text_color text not null default '#FFFFFF',
  welcome_message text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agents_user_id_idx on public.agents (user_id);

drop trigger if exists trg_agents_set_updated_at on public.agents;
create trigger trg_agents_set_updated_at
  before update on public.agents
  for each row
  execute procedure public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5) Leads
-- -----------------------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  email text,
  phone text,
  full_name text,
  last_question text,
  session_id text,
  source public.lead_source not null default 'unknown',
  created_at timestamptz not null default now()
);

create index if not exists leads_agent_id_idx on public.leads (agent_id);
create index if not exists leads_session_id_idx on public.leads (session_id)
  where session_id is not null;

-- Un seul lead actif par session / agent (anti-doublon, logique d’upsert côté app)
create unique index if not exists leads_agent_session_unique_idx
  on public.leads (agent_id, session_id)
  where session_id is not null;

-- -----------------------------------------------------------------------------
-- 6) lead_complaints (tickets)
-- -----------------------------------------------------------------------------

create table if not exists public.lead_complaints (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  content text not null,
  status public.complaint_status not null default 'open',
  resolution_notes text,
  priority public.complaint_priority not null default 'normal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_complaints_lead_id_idx on public.lead_complaints (lead_id);
create index if not exists lead_complaints_status_idx on public.lead_complaints (status);
create index if not exists lead_complaints_metadata_gin_idx
  on public.lead_complaints
  using gin (metadata);

comment on table public.lead_complaints is
  'Tickets / réclamations. Unicité « une discussion = un lead » via leads; consolidation des mises à jour côté application (append [Update ...]).';

-- -----------------------------------------------------------------------------
-- 7) messages (conversations)
-- -----------------------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  agent_id uuid not null references public.agents (id) on delete cascade,
  role public.chat_message_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_agent_id_idx on public.messages (agent_id);
create index if not exists messages_session_id_idx on public.messages (session_id);
create index if not exists messages_agent_created_idx
  on public.messages (agent_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 8) business_records (catalogue + FTS)
-- -----------------------------------------------------------------------------

create or replace function public.refresh_business_records_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(
      to_tsvector('simple', coalesce(new.title, '')),
      'A'
    )
    || setweight(
        to_tsvector('simple', coalesce(new.description, '')),
        'B'
      )
    || setweight(
        to_tsvector('simple', coalesce(new.value, '')),
        'B'
      )
    || setweight(
        to_tsvector('simple', coalesce(new.category, '')),
        'C'
      );
  return new;
end;
$$;

create table if not exists public.business_records (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  title text not null,
  description text,
  value text,
  category text,
  metadata jsonb,
  search_vector tsvector,
  created_at timestamptz not null default now()
);

create index if not exists business_records_agent_id_idx
  on public.business_records (agent_id);

create index if not exists business_records_search_vector_gin
  on public.business_records
  using gin (search_vector);

drop trigger if exists trg_business_records_search on public.business_records;
create trigger trg_business_records_search
  before insert or update of title, description, value, category
  on public.business_records
  for each row
  execute procedure public.refresh_business_records_search_vector();

-- -----------------------------------------------------------------------------
-- 9) knowledge (RAG, embeddings, pgvector)
-- -----------------------------------------------------------------------------

create table if not exists public.knowledge (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  answer text not null,
  source public.knowledge_source not null default 'human_resolution',
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_agent_id_idx on public.knowledge (agent_id);
create index if not exists knowledge_user_id_idx on public.knowledge (user_id);
create index if not exists knowledge_source_idx on public.knowledge (source);

-- -----------------------------------------------------------------------------
-- 10) learning_suggestions
-- -----------------------------------------------------------------------------

create table if not exists public.learning_suggestions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents (id) on delete cascade,
  status public.learning_suggestion_status not null default 'pending',
  user_question text not null,
  suggested_answer text not null,
  source text not null default 'live_search',
  created_at timestamptz not null default now()
);

create index if not exists learning_suggestions_agent_pending_idx
  on public.learning_suggestions (agent_id)
  where status = 'pending';

-- -----------------------------------------------------------------------------
-- 11) Recherche vectorielle (Gemini 768d)
-- -----------------------------------------------------------------------------

create or replace function public.match_knowledge (
  p_agent_id uuid,
  query_embedding text,
  match_count int default 5
)
returns table (question text, answer text)
language sql
stable
set search_path = public, pg_temp
as $$
  select k.question, k.answer
  from public.knowledge k
  where k.agent_id = p_agent_id
    and k.embedding is not null
  order by k.embedding <=> query_embedding::vector(768)
  limit least(greatest(coalesce(match_count, 1), 1), 20);
$$;

-- -----------------------------------------------------------------------------
-- 12) RLS
-- -----------------------------------------------------------------------------

alter table public.agents enable row level security;
alter table public.leads enable row level security;
alter table public.lead_complaints enable row level security;
alter table public.messages enable row level security;
alter table public.business_records enable row level security;
alter table public.knowledge enable row level security;
alter table public.learning_suggestions enable row level security;

-- Nettoyage idempotent (noms hérités des migrations)
drop policy if exists "agents_select_own" on public.agents;
drop policy if exists "agents_insert_own" on public.agents;
drop policy if exists "agents_update_own" on public.agents;
drop policy if exists "agents_delete_own" on public.agents;

create policy "agents_select_own" on public.agents for select
  using (user_id = (select auth.uid()));

create policy "agents_insert_own" on public.agents for insert
  with check (user_id = (select auth.uid()));

create policy "agents_update_own" on public.agents for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "agents_delete_own" on public.agents for delete
  using (user_id = (select auth.uid()));

-- Leads
drop policy if exists "leads_select_own" on public.leads;
drop policy if exists "leads_insert_own" on public.leads;
drop policy if exists "leads_update_own" on public.leads;
drop policy if exists "leads_delete_own" on public.leads;

create policy "leads_select_own" on public.leads for select
  using (exists (select 1 from public.agents a where a.id = leads.agent_id and a.user_id = (select auth.uid())));

create policy "leads_insert_own" on public.leads for insert
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

create policy "leads_update_own" on public.leads for update
  using (exists (select 1 from public.agents a where a.id = leads.agent_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

create policy "leads_delete_own" on public.leads for delete
  using (exists (select 1 from public.agents a where a.id = leads.agent_id and a.user_id = (select auth.uid())));

-- Tickets (pas d’insert public : widget via service_role côté serveur, ou utilisateur authentifié)
drop policy if exists "Allow public insert for leads" on public.lead_complaints;
drop policy if exists "lead_complaints_select_own_agent" on public.lead_complaints;
drop policy if exists "lead_complaints_update_own_agent" on public.lead_complaints;
drop policy if exists "lead_complaints_insert_own_agent" on public.lead_complaints;

create policy "lead_complaints_select_own_agent" on public.lead_complaints for select
  using (
    exists (
      select 1
      from public.leads l
      join public.agents a on a.id = l.agent_id
      where l.id = lead_complaints.lead_id
        and a.user_id = (select auth.uid())
    )
  );

create policy "lead_complaints_insert_own_agent" on public.lead_complaints for insert
  with check (
    exists (
      select 1
      from public.leads l
      join public.agents a on a.id = l.agent_id
      where l.id = lead_id
        and a.user_id = (select auth.uid())
    )
  );

create policy "lead_complaints_update_own_agent" on public.lead_complaints for update
  using (
    exists (
      select 1
      from public.leads l
      join public.agents a on a.id = l.agent_id
      where l.id = lead_complaints.lead_id
        and a.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.leads l
      join public.agents a on a.id = l.agent_id
      where l.id = lead_id
        and a.user_id = (select auth.uid())
    )
  );

-- Messages
drop policy if exists "messages_select_own" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;

create policy "messages_select_own" on public.messages for select
  using (exists (select 1 from public.agents a where a.id = messages.agent_id and a.user_id = (select auth.uid())));

create policy "messages_insert_own" on public.messages for insert
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

-- business_records
drop policy if exists "business_records_select_own" on public.business_records;
drop policy if exists "business_records_insert_own" on public.business_records;
drop policy if exists "business_records_update_own" on public.business_records;
drop policy if exists "business_records_delete_own" on public.business_records;

create policy "business_records_select_own" on public.business_records for select
  using (exists (select 1 from public.agents a where a.id = business_records.agent_id and a.user_id = (select auth.uid())));

create policy "business_records_insert_own" on public.business_records for insert
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

create policy "business_records_update_own" on public.business_records for update
  using (exists (select 1 from public.agents a where a.id = business_records.agent_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

create policy "business_records_delete_own" on public.business_records for delete
  using (exists (select 1 from public.agents a where a.id = business_records.agent_id and a.user_id = (select auth.uid())));

-- knowledge (politique par user_id sur la ligne)
drop policy if exists "knowledge_select_own_user_id" on public.knowledge;
drop policy if exists "knowledge_insert_own_user_id" on public.knowledge;
drop policy if exists "knowledge_update_own_user_id" on public.knowledge;
drop policy if exists "knowledge_delete_own_user_id" on public.knowledge;
drop policy if exists "knowledge_select_own_agent" on public.knowledge;
drop policy if exists "knowledge_insert_own_agent" on public.knowledge;
drop policy if exists "knowledge_delete_own_agent" on public.knowledge;

create policy "knowledge_select_own_user_id" on public.knowledge for select
  using (user_id = (select auth.uid()));

create policy "knowledge_insert_own_user_id" on public.knowledge for insert
  with check (user_id = (select auth.uid()) and exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

create policy "knowledge_update_own_user_id" on public.knowledge for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

create policy "knowledge_delete_own_user_id" on public.knowledge for delete
  using (user_id = (select auth.uid()));

-- learning_suggestions
drop policy if exists "learning_suggestions_select_own" on public.learning_suggestions;
drop policy if exists "learning_suggestions_update_own" on public.learning_suggestions;
drop policy if exists "learning_suggestions_insert_own" on public.learning_suggestions;

create policy "learning_suggestions_select_own" on public.learning_suggestions for select
  using (exists (select 1 from public.agents a where a.id = learning_suggestions.agent_id and a.user_id = (select auth.uid())));

create policy "learning_suggestions_insert_own" on public.learning_suggestions for insert
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

create policy "learning_suggestions_update_own" on public.learning_suggestions for update
  using (exists (select 1 from public.agents a where a.id = learning_suggestions.agent_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.agents a where a.id = agent_id and a.user_id = (select auth.uid())));

-- -----------------------------------------------------------------------------
-- 13) Droits d’exécution (rôles Supabase)
-- Note : le rôle service_role contourne RLS côté serveur (clé service).
-- Le client navigateur utilise en général le rôle authenticated (les politiques
-- RLS s’appliquent). Le rôle anon n’a pas besoin de privilèges DML ici.
-- -----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant execute on function public.match_knowledge (uuid, text, int) to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- -----------------------------------------------------------------------------
-- 14) Rechargement API (PostgREST)
-- -----------------------------------------------------------------------------

notify pgrst, 'reload schema';
