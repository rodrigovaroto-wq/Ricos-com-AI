-- The once-per-conversation marks of the lead's profile, merged into it instead of overwriting it (grafo §123 residue,
-- operator, 2026-10-22). The turn used to PATCH the whole `profile` it had built at the start of the turn just to set
-- `stock_offered` / `vague_asked`: a write to the profile in between would be undone. `||` keeps every other key.
--
-- DEPLOY ORDER: apply BEFORE the `turn` that calls it. Without it the call answers 404, the turn swallows it, and the mark
-- is lost (the stock line or the vague question may go once more) — nothing else breaks. Idempotent.
-- Read and written by primary key (leads_pkey). Same grants as every function here: the service role alone.
create or replace function public.lead_profile_mark(p_lead_id uuid, p_marks jsonb)
returns void language sql
set search_path = public, pg_catalog as $$
  update public.leads set profile = coalesce(profile, '{}'::jsonb) || p_marks where id = p_lead_id;
$$;

revoke all on function public.lead_profile_mark(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.lead_profile_mark(uuid, jsonb) to service_role;
