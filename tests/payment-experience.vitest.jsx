/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentExperience } from "@/src/components/payment/payment-experience.js";
import { MAX_INSTALLMENTS } from "@/src/payments/payment-config.js";

// O provedor devolve MAIS parcelas do que a loja aceita — 18 no cartao de teste.
// Os valores sao os que o sandbox retornou de verdade para R$ 129,00.
function payerCosts() {
  return Array.from({ length: 18 }, (_, indice) => {
    const parcelas = indice + 1;
    const semJuros = parcelas === 1;
    const total = semJuros ? 129 : 129 * (1 + 0.03 * parcelas);

    return {
      installment_amount: total / parcelas,
      installment_rate: semJuros ? 0 : 3,
      installments: parcelas,
      total_amount: total
    };
  });
}

// `Intl.NumberFormat` em pt-BR separa "R$" do numero com espaco NAO-QUEBRAVEL
// (U+00A0). Sem normalizar, uma asercao com espaco comum falha mesmo com o
// texto certo na tela.
function texto(elemento) {
  return elemento.textContent.replace(/ /g, " ");
}

function montar(props = {}) {
  return render(
    <PaymentExperience
      amountCents={12900}
      initialStatus="aguardando_pagamento"
      orderId="11111111-1111-4111-8111-111111111111"
      orderNumber="TSZ-TESTE"
      publicKey="TEST-chave"
      {...props}
    />
  );
}

beforeEach(() => {
  // A tela consulta o status em laco; sem isto o jsdom reclama de rede.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({ status: "aguardando_pagamento" }), ok: true }))
  );

  window.MercadoPago = class {
    async getInstallments() {
      return [{ payer_costs: payerCosts() }];
    }
    async getPaymentMethods() {
      return { results: [{ id: "master", issuer: { id: 1 } }] };
    }
    async createCardToken() {
      return { id: "token-de-teste" };
    }
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.MercadoPago;
});

describe("tela de pagamento", () => {
  // `mode="wait"` so montava o painel novo quando a animacao de saida terminava,
  // e ela nao termina com o requestAnimationFrame parado — aba de segundo plano.
  // Visto no staging: aba marcada como Boleto, conteudo travado no Pix.
  // A troca nao pode depender de animacao nenhuma.
  it("troca de painel sem esperar animacao", async () => {
    montar();
    expect(screen.getByRole("heading", { name: "Pix" })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));

    // Sincrono de proposito: nada de waitFor. Se precisasse esperar, seria o bug.
    expect(screen.getByRole("heading", { name: "Cartao" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Pix" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Boleto" }));
    expect(screen.getByRole("heading", { name: "Boleto" })).toBeTruthy();
  });

  it("mostra as parcelas com o valor que o provedor vai cobrar", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));
    fireEvent.change(screen.getByLabelText("Numero do cartao"), {
      target: { value: "5031433215406351" }
    });

    const seletor = screen.getByLabelText("Parcelas");
    await waitFor(() => expect(seletor.options.length).toBeGreaterThan(1));

    // O provedor ofereceu 18; a rota aceita MAX_INSTALLMENTS. Mostrar o que o
    // servidor recusa com 400 seria oferecer um erro ao cliente.
    expect(seletor.options.length).toBe(MAX_INSTALLMENTS);
    expect(texto(seletor.options[0])).toContain("sem juros");
    expect(texto(seletor.options[2])).toMatch(/3x de R\$ .*total R\$/);
  });

  // O total com juros e o valor do pedido sao coisas diferentes, e a tela nao
  // pode deixar o cliente achar que o produto encareceu.
  it("separa o total cobrado do valor do pedido", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));
    fireEvent.change(screen.getByLabelText("Numero do cartao"), {
      target: { value: "5031433215406351" }
    });

    const seletor = screen.getByLabelText("Parcelas");
    await waitFor(() => expect(seletor.options.length).toBe(MAX_INSTALLMENTS));
    fireEvent.change(seletor, { target: { value: "3" } });

    const aviso = await screen.findByText(/o total cobrado sobe para/i);
    expect(texto(aviso)).toContain("O pedido continua valendo");
    expect(texto(aviso)).toContain("R$ 129,00");
  });

  it("nao cobra juros na opcao a vista", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));
    fireEvent.change(screen.getByLabelText("Numero do cartao"), {
      target: { value: "5031433215406351" }
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Parcelas").options.length).toBe(MAX_INSTALLMENTS)
    );

    expect(screen.getByText(/1x sem juros/i)).toBeTruthy();
    expect(screen.queryByText(/o total cobrado sobe para/i)).toBeNull();
  });

  // Sem simulacao o cliente ainda precisa conseguir pagar.
  it("cai para a lista simples quando o provedor nao responde", async () => {
    window.MercadoPago = class {
      async getInstallments() {
        throw new Error("provedor fora do ar");
      }
    };

    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));
    fireEvent.change(screen.getByLabelText("Numero do cartao"), {
      target: { value: "5031433215406351" }
    });

    const seletor = screen.getByLabelText("Parcelas");
    await waitFor(() => expect(seletor.options.length).toBe(MAX_INSTALLMENTS));
    expect(texto(seletor.options[0]).trim()).toBe("1x");
  });
});

describe("copia do codigo Pix", () => {
  // A tela manda "selecione e copie" quando a copia falha. Truncado, o codigo
  // nao esta na tela para ser selecionado — o aviso vira armadilha.
  it("abre o codigo inteiro quando a copia falha", async () => {
    const qrCode = "00020126580014br.gov.bcb.pix0136".padEnd(162, "0");

    vi.stubGlobal("fetch", async (url) => {
      if (String(url).includes("/api/pagamento/pix")) {
        return { json: async () => ({ qrCode, qrCodeBase64: "" }), ok: true };
      }

      return { json: async () => ({ status: "aguardando_pagamento" }), ok: true };
    });

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("bloqueado"))) }
    });

    const { container } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Gerar codigo Pix/i }));

    const copiar = await screen.findByRole("button", { name: /Copiar o codigo Pix/i });
    const caixa = container.querySelector("[class*='copyBox']");
    expect(caixa.className).not.toContain("copyBoxAberta");

    fireEvent.click(copiar);

    await screen.findByText(/O codigo esta inteiro abaixo/i);
    expect(container.querySelector("[class*='copyBoxAberta']")).toBeTruthy();
    // E o codigo inteiro continua no DOM para ser selecionado.
    expect(container.querySelector("code").textContent).toBe(qrCode);
  });
});

describe("cartao: validade e tipo", () => {
  // O vencimento e impresso no cartao como um dado unico ("09/29"). Dois campos
  // obrigavam o cliente a traduzir o que estava lendo — no celular, com dois
  // campos pequenos lado a lado, e onde mais se erra.
  it("formata a validade enquanto digita", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));

    const validade = screen.getByLabelText(/^Validade/);
    fireEvent.change(validade, { target: { value: "0929" } });

    expect(validade.value).toBe("09/29");
  });

  it("nao existe mais campo separado de mes e ano", () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));

    expect(screen.queryByLabelText("Mes")).toBeNull();
    expect(screen.queryByLabelText("Ano")).toBeNull();
  });

  // Validade errada precisa parar ANTES da tokenizacao: o SDK devolveria um
  // erro generico em ingles, e o cliente nao saberia qual campo corrigir.
  it("recusa validade invalida sem chamar o provedor", async () => {
    const criarToken = vi.fn(async () => ({ id: "token" }));
    window.MercadoPago = class {
      async getInstallments() {
        return [{ payer_costs: payerCosts() }];
      }
      async getPaymentMethods() {
        return { results: [{ id: "master", issuer: { id: 1 }, payment_type_id: "credit_card" }] };
      }
      createCardToken = criarToken;
    };

    const { container } = montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));

    fireEvent.change(screen.getByLabelText("Numero do cartao"), {
      target: { value: "5031433215406351" }
    });
    fireEvent.change(screen.getByLabelText(/^Validade/), { target: { value: "01/20" } });
    fireEvent.change(screen.getByLabelText("Nome impresso no cartao"), {
      target: { value: "TESTE" }
    });
    fireEvent.change(screen.getByLabelText("Codigo de seguranca"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), {
      target: { value: "12345678909" }
    });

    fireEvent.submit(container.querySelector("form"));

    expect(await screen.findByText(/Validade invalida/i)).toBeTruthy();
    expect(criarToken).not.toHaveBeenCalled();
  });

  // O tipo vem do PROVEDOR, pelo bin. Com um trilho so — o caso de hoje, porque
  // a conta da loja nao tem debito habilitado — nao ha o que escolher.
  it("nao mostra escolha quando o cartao aceita um trilho so", async () => {
    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));
    fireEvent.change(screen.getByLabelText("Numero do cartao"), {
      target: { value: "5031433215406351" }
    });

    await waitFor(() => expect(screen.getByLabelText("Parcelas")).toBeTruthy());
    expect(screen.queryByRole("radiogroup", { name: /tipo do cartao/i })).toBeNull();
  });

  // Quando o provedor diz que o cartao aceita os dois, a escolha aparece — e
  // escolher debito tira o parcelamento, porque o valor sai de uma vez.
  it("com debito e credito, escolher debito esconde as parcelas", async () => {
    window.MercadoPago = class {
      async getInstallments() {
        return [{ payer_costs: payerCosts() }];
      }
      async getPaymentMethods() {
        return {
          results: [
            { id: "master", issuer: { id: 1 }, payment_type_id: "credit_card" },
            { id: "debmaster", issuer: { id: 1 }, payment_type_id: "debit_card" }
          ]
        };
      }
      async createCardToken() {
        return { id: "token" };
      }
    };

    montar();
    fireEvent.click(screen.getByRole("tab", { name: "Cartao" }));
    fireEvent.change(screen.getByLabelText("Numero do cartao"), {
      target: { value: "5031433215406351" }
    });

    const debito = await screen.findByLabelText("Débito");
    expect(screen.getByLabelText("Crédito")).toBeTruthy();
    expect(screen.getByLabelText("Parcelas")).toBeTruthy();

    fireEvent.click(debito);

    await waitFor(() => expect(screen.queryByLabelText("Parcelas")).toBeNull());
    expect(screen.getByText(/sai de uma vez, sem parcelamento/i)).toBeTruthy();
  });
});
