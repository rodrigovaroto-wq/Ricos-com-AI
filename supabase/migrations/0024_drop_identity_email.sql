-- No e-mail (operator, 2026-10-07, grafo §66): the agent no longer asks it, stores it or waits for it.
-- The turn drops a stored e-mail when it reads the lead, but only writes the lead when another field
-- changes — a lead that never writes again would keep it. This removes the ones already stored.
-- Idempotent; touches only rows that still carry the key.
update public.leads set identity = identity - 'email' where identity ? 'email';
