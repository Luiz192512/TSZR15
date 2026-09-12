-- Pix vencido que ninguem avisou que venceu — e o CHECK que impedia o pedido de
-- saber disso.
--
-- 1. O CHECK de `orders.payment_status`
--
-- `payments.status` aceita 10 estados desde a migracao 20260825120000.
-- `orders.payment_status` ficou com 4: aguardando_pagamento, pagamento_confirmado,
-- cancelado e reembolsado. Consequencias, todas em silencio:
--   - o webhook copia o estado do pagamento para o pedido sem conferir o erro
--     dessa escrita. `em_analise`, `recusado`, `autorizado`, `estornado`,
--     `reembolsado_parcial` e `expirado` eram recusados pelo banco, e o pedido
--     seguia mostrando o estado anterior;
--   - o formulario do admin oferece os 10 estados (src/orders/status.js), mas
--     salvar um pedido com um dos 6 de fora falhava;
--   - a funcao abaixo, que grava `expirado` no pedido, falharia inteira.
-- Alargar so aceita mais valores: nenhuma linha existente fica invalida.
--
-- 2. Pix vencido
--
-- O provedor gera o Pix com validade (`date_of_expiration`, gravada em
-- `payments.expires_at`) e deveria mandar um `payment.updated` quando ele cai.
-- No sandbox esse aviso nunca chegou: dois Pix de teste venceram em 05/09 e
-- 09/09, receberam so `payment.created` e seguiram "aguardando pagamento" no
-- banco, no admin e na conta do cliente. Em producao o aviso nao foi
-- verificado, e a loja nao pode depender de algo que nao verificou.
--
-- A funcao marca como `expirado` o Pix do provedor que passou da validade ha
-- mais de 10 minutos, e leva o mesmo estado ao pedido. A folga existe para o Pix
-- pago no ultimo minuto: o webhook dele chega segundos depois. E se chegar mesmo
-- apos a marcacao, `expirado` (2) para `pagamento_confirmado` (4) e avanco na
-- escala de src/payments/payment-backend.js — a confirmacao vale.
--
-- A mesma regra existe em JavaScript (src/payments/payment-expiry.js) para a
-- rota de status, que por contrato so le. tests/payment-expiry.test.mjs confere
-- que as duas concordam.
--
-- Fica de fora, de proposito:
--   - boleto: vence no dia, mas quem paga no ultimo dia compensa de um a tres
--     dias uteis depois. Marcar expirado no vencimento diria a quem pagou que o
--     pagamento nao vale;
--   - pagamento manual (fluxo de WhatsApp): nao tem `expires_at`;
--   - pedido que ja saiu de "aguardando": a funcao so move quem ainda esta la.
--
-- Roda pelo pg_cron a cada 10 minutos. Para desligar:
--   select cron.unschedule('expirar-pix-vencido');

alter table public.orders
  drop constraint if exists orders_payment_status_check;

alter table public.orders
  add constraint orders_payment_status_check check (
    payment_status in (
      'aguardando_pagamento',
      'em_analise',
      'autorizado',
      'pagamento_confirmado',
      'recusado',
      'expirado',
      'cancelado',
      'reembolsado_parcial',
      'reembolsado',
      'estornado'
    )
  );

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.expire_stale_pix_payments()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expirados integer;
begin
  with vencidos as (
    update public.payments
    set status = 'expirado',
        updated_by = 'expiracao_pix'
    where status = 'aguardando_pagamento'
      and provider = 'mercadopago'
      and payment_method_id = 'pix'
      and expires_at is not null
      and expires_at < now() - interval '10 minutes'
    returning order_id
  ),
  pedidos as (
    update public.orders as pedido
    set payment_status = 'expirado'
    from vencidos
    where pedido.id = vencidos.order_id
      and pedido.payment_status = 'aguardando_pagamento'
    returning pedido.id
  )
  select count(*) into v_expirados from vencidos;

  return v_expirados;
end;
$$;

-- Nao e rota: a API publica nao pode disparar isto.
revoke all on function public.expire_stale_pix_payments() from public, anon, authenticated;

select cron.schedule(
  'expirar-pix-vencido',
  '*/10 * * * *',
  $$select public.expire_stale_pix_payments()$$
);
