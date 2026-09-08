-- Nome, e-mail e CPF: o que a API da Coinzz exige e a conversa nunca coletava.
--
-- Fica em jsonb, ao lado de `address`, e pelo mesmo motivo: chega em pedaços ao longo
-- da conversa, e o que está incompleto tem de sobreviver entre um turno e o outro.
-- Pedido só nasce quando os três estão preenchidos e o endereço foi confirmado por ela.
alter table public.leads add column if not exists identity jsonb;

comment on column public.leads.identity is
  'Dados do comprador para o pedido: name, email, document (CPF, só dígitos). Acumula ao longo da conversa; o pedido só é criado quando está completo.';

-- `address` já existia, mas nada dizia que a confirmação mora dentro dele. Endereço
-- completo NÃO é endereço confirmado: sem `confirmedAt` a cliente não viu a leitura de
-- volta, e mandar assim é a entrega que falha e volta — em COD, o frete perdido duas vezes.
comment on column public.leads.address is
  'Endereço da entrega. `confirmedAt` (ISO) só existe depois de a cliente confirmar a leitura de volta (§D2). Sem ele, nenhum pedido pode ser criado.';
