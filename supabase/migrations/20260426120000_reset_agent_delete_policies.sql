-- Permet au propriétaire de l’agent d’effacer l’historique chat et les tickets
-- lors d’un reset (ordre : messages / tickets / leads côté app).

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages for delete
  using (
    exists (
      select 1 from public.agents a
      where a.id = messages.agent_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "lead_complaints_delete_own_agent" on public.lead_complaints;
create policy "lead_complaints_delete_own_agent" on public.lead_complaints for delete
  using (
    exists (
      select 1 from public.leads l
      join public.agents a on a.id = l.agent_id
      where l.id = lead_complaints.lead_id
        and a.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
