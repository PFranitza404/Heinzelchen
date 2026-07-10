-- Supabase linter 0013: public tables must have row level security enabled.
-- The counter is an internal implementation detail used by the service-role
-- booking webhook to assign order numbers. It should not be readable or
-- writable by anonymous or authenticated clients.
alter table public.auftrag_counter enable row level security;

revoke all on table public.auftrag_counter from anon, authenticated;
grant select, update on table public.auftrag_counter to service_role;

revoke execute on function public.get_next_auftragsnummer() from anon, authenticated;
revoke execute on function public.assign_auftragsnummer(uuid) from anon, authenticated;
grant execute on function public.get_next_auftragsnummer() to service_role;
grant execute on function public.assign_auftragsnummer(uuid) to service_role;
