import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";

import { SiteHeader } from "@/src/components/site-header.js";

export const metadata = {
  title: "Trocas & Devoluções | TSZR15",
  description:
    "Como solicitar troca, devolução ou atendimento de garantia das peças e acessórios da TSZR15."
};

export default function TrocasDevolucoesPage() {
  return (
    <main className={cx(globalStyles, "page-shell legal-page")}>
      <SiteHeader />

      <article className={cx(globalStyles, "legal-content")}>
        <p className={cx(globalStyles, "section-label")}>Atendimento</p>
        <h1>Trocas & Devoluções</h1>
        <p className={cx(globalStyles, "legal-lead")}>
          A TSZR15 opera com compra assistida: você escolhe as peças no catálogo e o fechamento
          acontece pelo WhatsApp. Qualquer pedido de troca, devolução ou garantia também é
          conduzido pelo mesmo canal, para agilizar a conferência e o atendimento.
        </p>

        <h2>Direito de arrependimento (compras a distância)</h2>
        <p>
          Conforme o artigo 49 do Código de Defesa do Consumidor, em compras feitas fora de uma
          loja física você pode desistir em até <strong>7 dias corridos</strong> após receber o
          produto, sem precisar justificar. Nesse caso, os valores pagos são devolvidos.
        </p>

        <h2>Produtos com defeito</h2>
        <p>
          Se a peça chegar com defeito de fabricação, entre em contato em até 30 dias (produtos não
          duráveis) ou 90 dias (produtos duráveis), como prevê o artigo 26 do CDC. Vamos avaliar o
          caso e combinar reparo, troca ou devolução do valor.
        </p>

        <h2>Condições para troca ou devolução</h2>
        <ul>
          <li>Produto sem sinais de uso ou instalação, quando o motivo for arrependimento.</li>
          <li>Acompanhado dos itens recebidos (embalagem, acessórios e brindes, se houver).</li>
          <li>Registro do pedido (número do pedido e contato usados na compra).</li>
        </ul>

        <h2>Como solicitar</h2>
        <ol>
          <li>Chame a TSZR15 no WhatsApp informando o número do pedido.</li>
          <li>Descreva o motivo (arrependimento, defeito ou troca de variação) e, se possível, envie fotos.</li>
          <li>Combinamos o envio de retorno e a forma de reembolso ou reposição.</li>
        </ol>

        <h2>Prazos e custos</h2>
        <p>
          A análise é feita em até 2 dias úteis após recebermos o produto de volta. No arrependimento
          dentro dos 7 dias, o valor pago é devolvido integralmente. Em caso de defeito, o custo de
          retorno é por conta da TSZR15.
        </p>

        <p className={cx(globalStyles, "legal-note")}>
          Este texto descreve a política geral da loja e não substitui os direitos previstos em lei.
          Última atualização: julho de 2026.
        </p>
      </article>
    </main>
  );
}
