import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { notifyCustomerOfConfirmedPurchase } from "../src/payments/purchase-confirmation.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

// Dube do envio. O modulo real carrega `server-only`, que nao existe fora do
// Next — e o que precisa ser exercitado aqui e a DECISAO de avisar, nao o
// provedor de e-mail.
function createEnvio({ falha = false } = {}) {
  const enviados = [];

  return {
    enviados,
    async enviarEmail({ order }) {
      enviados.push(order.order_number);

      return falha ? { enviado: false, motivo: "falha-no-envio" } : { enviado: true };
    }
  };
}

/**
 * Dublê do Supabase, só com o que esta função usa.
 *
 * `reservaLivre` simula a corrida: quando é `false`, o `update ... is null` não
 * afeta linha nenhuma — que é o que acontece quando outro save chegou primeiro.
 */
function createSupabase({ compras, reservaLivre = true }) {
  const escritas = [];
  let reservaDisponivel = reservaLivre;

  return {
    escritas,
    supabase: {
      from(tabela) {
        if (tabela === "supplier_purchases") {
          return {
            eq: () => ({ data: compras, error: null }),
            select: () => ({ eq: () => Promise.resolve({ data: compras, error: null }) })
          };
        }

        if (tabela === "audit_logs") {
          return {
            insert(linha) {
              escritas.push({ tabela, ...linha });
              return Promise.resolve({ error: null });
            }
          };
        }

        return {
          update(patch) {
            const registro = { patch, tabela };

            return {
              eq(_coluna, valor) {
                registro.orderId = valor;

                return {
                  in(_status, permitidos) {
                    registro.statusPermitidos = permitidos;
                    escritas.push(registro);
                    return Promise.resolve({ error: null });
                  },
                  is(_coluna2, _valor2) {
                    return {
                      select: () => ({
                        maybeSingle: () => {
                          escritas.push({ ...registro, tipo: "reserva" });

                          if (!reservaDisponivel) {
                            return Promise.resolve({ data: null, error: null });
                          }

                          reservaDisponivel = false;

                          return Promise.resolve({
                            data: {
                              customer_email: "cliente@example.com",
                              customer_name: "Fulano de Tal",
                              id: valor,
                              order_number: "TSZ-1"
                            },
                            error: null
                          });
                        }
                      })
                    };
                  },
                  then(resolver) {
                    escritas.push(registro);
                    return Promise.resolve({ error: null }).then(resolver);
                  }
                };
              }
            };
          }
        };
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Quando avisar
// ---------------------------------------------------------------------------

// Um pedido dividido entre tres lojas com duas compradas NAO esta garantido. O
// cliente avisado cedo demais recebe uma confirmacao que pode ser desmentida.
test("nao avisa enquanto alguma loja continua pendente", async () => {
  for (const pendente of ["nao_comprado", "validando_origem", "problema"]) {
    const { escritas, supabase } = createSupabase({
      compras: [{ source_status: "comprado" }, { source_status: pendente }]
    });

    const resultado = await notifyCustomerOfConfirmedPurchase({ orderId: "pedido-1", supabase });

    assert.equal(resultado.motivo, "compras_pendentes", `${pendente} deveria segurar o aviso`);
    assert.deepEqual(escritas, [], "nada pode ser gravado enquanto ha loja pendente");
  }
});

test("avisa quando todas as lojas foram compradas", async () => {
  const { escritas, supabase } = createSupabase({
    compras: [{ source_status: "comprado" }, { source_status: "postado" }]
  });

  const { enviados, enviarEmail } = createEnvio();
  const resultado = await notifyCustomerOfConfirmedPurchase({
    enviarEmail,
    orderId: "pedido-1",
    supabase
  });

  assert.equal(resultado.motivo, "avisado");
  assert.equal(resultado.lojas, 2);
  assert.deepEqual(enviados, ["TSZ-1"], "exatamente um e-mail");

  const auditoria = escritas.find((escrita) => escrita.tabela === "audit_logs");
  assert.equal(auditoria?.action, "cliente_avisado_compra_confirmada");
});

// Pedido do fluxo de WhatsApp nunca teve compra registrada. Nao e erro, e nao
// pode virar e-mail.
test("pedido sem compra na origem nao gera aviso", async () => {
  const { escritas, supabase } = createSupabase({ compras: [] });

  const resultado = await notifyCustomerOfConfirmedPurchase({ orderId: "pedido-1", supabase });

  assert.equal(resultado.motivo, "sem_compras");
  assert.equal(resultado.ok, true);
  assert.deepEqual(escritas, []);
});

// ---------------------------------------------------------------------------
// Um e-mail, no maximo
// ---------------------------------------------------------------------------

// A reserva e o que impede o segundo e-mail: o `update ... is null` so afeta
// linha uma vez, e quem nao afetou nada para por ali.
test("dois saves seguidos mandam um aviso so", async () => {
  const { supabase } = createSupabase({
    compras: [{ source_status: "comprado" }]
  });

  const { enviados, enviarEmail } = createEnvio();
  const primeiro = await notifyCustomerOfConfirmedPurchase({
    enviarEmail,
    orderId: "pedido-1",
    supabase
  });
  const segundo = await notifyCustomerOfConfirmedPurchase({
    enviarEmail,
    orderId: "pedido-1",
    supabase
  });

  assert.equal(primeiro.motivo, "avisado");
  assert.equal(segundo.motivo, "ja_avisado");
  assert.equal(enviados.length, 1, "o segundo save nao pode mandar outro e-mail");
});

test("save que perde a corrida da reserva nao avisa", async () => {
  const { supabase } = createSupabase({
    compras: [{ source_status: "comprado" }],
    reservaLivre: false
  });

  const resultado = await notifyCustomerOfConfirmedPurchase({ orderId: "pedido-1", supabase });

  assert.equal(resultado.motivo, "ja_avisado");
  assert.equal(resultado.ok, true);
});

// A marca e gravada ANTES do envio. Gravar depois deixaria a janela entre
// enviar e marcar aberta para um segundo save mandar de novo.
test("a marca e gravada antes do envio, nao depois", async () => {
  const codigo = await source("src/payments/purchase-confirmation.js");

  const reserva = codigo.indexOf("purchase_confirmation_notified_at: new Date()");
  // O ponto de CHAMADA, nao a mencao no helper de import, que fica no topo do
  // arquivo e nao diz nada sobre a ordem de execucao.
  const envio = codigo.indexOf("await enviar({ order: reservado })");

  assert.ok(reserva > 0 && envio > 0);
  assert.ok(reserva < envio, "a reserva precisa vir antes do envio");
  assert.match(codigo, /\.is\("purchase_confirmation_notified_at", null\)/);
});

// ---------------------------------------------------------------------------
// O que o cliente nao pode descobrir
// ---------------------------------------------------------------------------

// O e-mail confirma a compra sem entregar o fornecedor. Nome de loja, numero do
// pedido na origem e codigo de rastreio ficam de fora.
test("o e-mail nao revela de onde o produto veio", async () => {
  const email = await source("src/payments/purchase-confirmation-email.js");
  const corpo = email.slice(email.indexOf("resend.emails.send"), email.indexOf("if (error)"));

  for (const proibido of [
    "source_store_name",
    "source_order_number",
    "tracking_code",
    "internal_channel",
    "shopee",
    "aliexpress"
  ]) {
    assert.equal(
      corpo.toLowerCase().includes(proibido),
      false,
      `o e-mail nao pode citar ${proibido}`
    );
  }
});

// Perder o aviso e um incomodo; derrubar a operacao do admin por causa dele
// seria o estrago. E, se o envio falhar, a marca volta para a proxima tentativa.
test("falha de e-mail nao derruba o save e libera nova tentativa", async () => {
  const codigo = await source("src/payments/purchase-confirmation.js");
  const admin = await source("src/admin/order-operation.js");

  assert.match(codigo, /purchase_confirmation_notified_at: null/);
  assert.match(codigo, /motivo === "falha-no-envio"/);

  // No admin, a chamada vive num try/catch fora da transacao.
  const bloco = admin.slice(admin.indexOf("notifyCustomerOfConfirmedPurchase({ orderId"));
  assert.match(bloco, /catch \(error\)/);
  assert.match(bloco, /confirmacao_cliente_pos_operacao_falhou/);
});

// O status so avanca depois do aviso. Invertido, o cliente veria "em separacao"
// antes de receber o e-mail — e o status mentiria se o envio falhasse.
test("o status avanca depois do aviso, e so a partir de pendente", async () => {
  const codigo = await source("src/payments/purchase-confirmation.js");

  const envio = codigo.indexOf("sendPurchaseConfirmedEmail");
  const status = codigo.indexOf("operational_status: STATUS_COMPRADO");

  assert.ok(envio < status, "o status nao pode avancar antes do aviso");
  assert.match(codigo, /\.in\("operational_status", \["compra_interna_pendente"/);
});
