/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaymentExperience } from "@/src/components/payment/payment-experience.js";

const PEDIDO = "11111111-1111-4111-8111-111111111111";

function montar(props = {}) {
  return render(
    <PaymentExperience
      amountCents={12900}
      initialStatus="aguardando_pagamento"
      orderId={PEDIDO}
      orderNumber="TSZ-TESTE"
      publicKey="TEST-chave"
      {...props}
    />
  );
}

let chamadas;

beforeEach(() => {
  chamadas = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      chamadas.push({ metodo: init?.method ?? "GET", url: String(url) });

      // O Pix ja nasce vencido: e o caso que a tela precisa saber tratar.
      if (String(url).includes("/api/pagamento/pix")) {
        return {
          json: async () => ({
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
            qrCode: "00020126-pix-de-teste",
            qrCodeBase64: ""
          }),
          ok: true
        };
      }

      return { json: async () => ({ status: "aguardando_pagamento" }), ok: true };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function chamadasPara(trecho) {
  return chamadas.filter((chamada) => chamada.url.includes(trecho));
}

describe("Pix vencido", () => {
  // A tela dizia "Gere outro para pagar" e nao oferecia botao nenhum: o cliente
  // precisava adivinhar que tinha que recarregar a pagina.
  it("oferece gerar outro codigo em vez de mandar recarregar", async () => {
    montar();

    fireEvent.click(screen.getByRole("button", { name: "Gerar codigo Pix" }));

    const outro = await screen.findByRole("button", { name: "Gerar outro codigo Pix" });

    fireEvent.click(outro);

    await waitFor(() => expect(chamadasPara("/api/pagamento/pix")).toHaveLength(2));
  });

  // Status final para a consulta. Se o cliente gera um codigo novo depois disso
  // e a consulta nao volta, ele paga e nunca ve a confirmacao.
  it("volta a consultar o status depois de gerar um codigo novo", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    montar({ initialStatus: "expirado" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(chamadasPara("/api/pagamento/status")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Gerar codigo Pix" }));

    await waitFor(() => expect(chamadasPara("/api/pagamento/pix")).toHaveLength(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(chamadasPara("/api/pagamento/status").length).toBeGreaterThan(0);
  });
});
