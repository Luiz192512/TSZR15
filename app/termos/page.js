import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";

import { SiteHeader } from "@/src/components/site-header.js";

export const metadata = {
  title: "Termos de Uso | TSZR15",
  description: "Regras de uso da loja TSZR15 e como funciona a compra assistida pelo WhatsApp."
};

export default function TermosPage() {
  return (
    <main className={cx(globalStyles, "page-shell legal-page")}>
      <SiteHeader />

      <article className={cx(globalStyles, "legal-content")}>
        <p className={cx(globalStyles, "section-label")}>Termos</p>
        <h1>Termos de Uso</h1>
        <p className={cx(globalStyles, "legal-lead")}>
          Ao usar o site da TSZR15 e fechar pedidos pelo WhatsApp, você concorda com as regras
          abaixo. Elas descrevem como funciona a nossa loja de peças e acessórios para Yamaha R15.
        </p>

        <h2>Como funciona a loja</h2>
        <p>
          O site é uma vitrine: você navega pelo catálogo, escolhe a peça e a variação e envia o
          pedido para o WhatsApp da TSZR15. O site não processa pagamento automático — o fechamento,
          a confirmação de disponibilidade e a forma de pagamento acontecem no atendimento.
        </p>

        <h2>Preços, disponibilidade e prazos</h2>
        <ul>
          <li>Preços e disponibilidade podem mudar e são confirmados no atendimento.</li>
          <li>Algumas peças ficam sob consulta, conforme a disponibilidade de estoque.</li>
          <li>Prazos de confirmação e entrega são informados durante a compra assistida.</li>
        </ul>

        <h2>Sua conta</h2>
        <p>
          Ao criar uma conta, você é responsável por manter seus dados corretos e por guardar sua
          senha. Use a loja de forma legítima, sem tentar burlar, sobrecarregar ou acessar áreas
          restritas do sistema.
        </p>

        <h2>Compra assistida</h2>
        <p>
          Na compra assistida, a TSZR15 organiza o pedido e a entrega para você pelo WhatsApp. Você
          autoriza o uso dos seus dados de cadastro e entrega para viabilizar o pedido, como
          descrito na{" "}
          <a href="/privacidade">Política de Privacidade</a>. Trocas e devoluções seguem a{" "}
          <a href="/trocas-e-devolucoes">página de Trocas & Devoluções</a>.
        </p>

        <p className={cx(globalStyles, "legal-note")}>
          Estes termos podem ser atualizados a qualquer momento. Última atualização: julho de 2026.
        </p>
      </article>
    </main>
  );
}
