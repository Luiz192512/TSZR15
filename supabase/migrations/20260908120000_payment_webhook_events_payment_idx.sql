-- Indice de cobertura para a chave estrangeira `payment_id`.
--
-- Sem ele, todo `delete` ou `update` da chave em `payments` obriga o Postgres a
-- varrer `payment_webhook_events` inteira para checar a referencia. Hoje a
-- tabela esta vazia e a varredura custa nada; ela cresce um registro por
-- notificacao recebida do provedor, e o custo aparece quando ninguem mais
-- estiver olhando.
--
-- As outras tres chaves da tabela ja tinham indice: `order_id`,
-- `(provider, provider_event_id)` e a primaria.

create index if not exists payment_webhook_events_payment_idx
  on public.payment_webhook_events (payment_id);
