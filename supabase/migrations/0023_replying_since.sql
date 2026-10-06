-- One turn writes a reply per conversation at a time (grafo §61, operator, 2026-10-06). The turn
-- of a new message, past its quiet window, takes the conversation with a conditional update
-- (`replying_since` null or older than 150 s, the platform's cut) and clears it when it ends. A
-- message that arrives while it is set joins that turn, which folds it into its reply.
--
-- Additive and nullable: before this runs, the conditional update fails, the turn reads that as
-- "nobody holds it" and answers as before, so deploy order does not matter. Read and written by
-- primary key only (conversations_pkey); no index.
alter table public.conversations add column if not exists replying_since timestamptz;

comment on column public.conversations.replying_since is
  'When the turn now writing a reply took the conversation. Null = nobody is writing. Older than 150 s = stale (that turn was cut).';
