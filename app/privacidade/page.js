import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";

import { SiteHeader } from "@/src/components/site-header.js";

export const metadata = {
  title: "Política de Privacidade | TSZR15",
  description:
    "Como a TSZR15 coleta, usa e protege seus dados pessoais no atendimento e no fechamento de pedidos."
};

export default function PrivacidadePage() {
  return (
    <main className={cx(globalStyles, "page-shell legal-page")}>
      <SiteHeader />

      <article className={cx(globalStyles, "legal-content")}>
        <p className={cx(globalStyles, "section-label")}>Privacidade</p>
        <h1>Política de Privacidade</h1>
        <p className={cx(globalStyles, "legal-lead")}>
          Esta política explica quais dados a TSZR15 coleta, por que coleta e como você pode exercer
          seus direitos. Tratamos seus dados de acordo com a Lei Geral de Proteção de Dados (LGPD,
          Lei 13.709/2018).
        </p>

        <h2>Quais dados coletamos</h2>
        <ul>
          <li>Dados de cadastro: nome, CPF/CNPJ, e-mail e telefone/WhatsApp.</li>
          <li>Dados de entrega: endereço informado para envio do pedido.</li>
          <li>Dados do pedido: itens, variações e histórico de compras e avaliações.</li>
        </ul>

        <h2>Como usamos seus dados</h2>
        <p>
          Usamos seus dados apenas para operar a loja: montar e confirmar o pedido, dar andamento
          ao atendimento e à compra assistida pelo WhatsApp, organizar a entrega e manter seu
          histórico na conta. Não vendemos seus dados nem os usamos para publicidade de terceiros.
        </p>

        <h2>Com quem compartilhamos</h2>
        <p>
          Compartilhamos somente o necessário para cumprir o pedido — por exemplo, dados de entrega
          com a transportadora responsável pelo envio. Os dados ficam armazenados em infraestrutura
          de nuvem (Supabase) com controle de acesso.
        </p>

        <h2>Seus direitos (LGPD)</h2>
        <ul>
          <li>Confirmar e acessar os dados que temos sobre você.</li>
          <li>Corrigir dados incompletos ou desatualizados (na sua conta ou pelo WhatsApp).</li>
          <li>Solicitar a exclusão dos seus dados, respeitadas as obrigações legais.</li>
        </ul>

        <h2>Como falar sobre privacidade</h2>
        <p>
          Para exercer qualquer direito ou tirar dúvidas sobre seus dados, fale com a TSZR15 pelo
          WhatsApp informado no rodapé do site. Respondemos o quanto antes.
        </p>

        <p className={cx(globalStyles, "legal-note")}>
          Este texto descreve a prática geral da loja e pode ser atualizado. Última atualização:
          julho de 2026.
        </p>
      </article>
    </main>
  );
}
