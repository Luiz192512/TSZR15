import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";

import { adminSignOutAction } from "@/app/admin/actions.js";
import { getPublicSupabaseConfig } from "@/src/lib/supabase/config.js";
import { SiteHeader } from "@/src/components/site-header.js";

export function formatCurrency(cents, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency
  }).format((cents ?? 0) / 100);
}

export function centsToInput(cents) {
  if (!Number.isInteger(cents)) {
    return "";
  }

  return String((cents / 100).toFixed(2)).replace(".", ",");
}

export function arrayToTextarea(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

export function productPriceToInput(cents) {
  return centsToInput(cents) || "";
}

export function productCostToInput(cents) {
  return centsToInput(cents) || "";
}

export function getAdminPage(params, key) {
  const page = Number.parseInt(String(params?.[key] ?? ""), 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function getMessage(params) {
  if (params?.status === "salvo") {
    return "Pedido atualizado.";
  }

  if (params?.status === "pedido-confirmado") {
    return "Pedido interno confirmado.";
  }

  if (params?.status === "pedido-recusado") {
    return "Pedido interno recusado.";
  }

  if (params?.status === "pedido-criado") {
    return "Pedido criado no painel admin.";
  }

  if (params?.status === "repasse-registrado") {
    return "Repasse registrado. O valor sai da conta por uma pessoa, nao pelo sistema.";
  }

  if (params?.status === "repasse-desfeito") {
    return "Repasse desfeito. O lancamento voltou para pendente.";
  }

  if (params?.status === "ledger-recalculado") {
    return "Lancamento recalculado a partir do pagamento e das compras.";
  }

  if (params?.status === "produto-salvo") {
    return "Produto salvo no catalogo.";
  }

  if (params?.status === "produto-arquivado") {
    return "Produto arquivado da vitrine.";
  }

  if (params?.status === "cupom-salvo") {
    return "Cupom salvo.";
  }

  if (params?.status === "cupom-arquivado") {
    return "Cupom desativado.";
  }

  if (params?.status === "avaliacao-approved") {
    return "Avaliacao aprovada e liberada no produto.";
  }

  if (params?.status === "avaliacao-rejected") {
    return "Avaliacao recusada e mantida no historico interno.";
  }

  return typeof params?.error === "string" ? params.error : "";
}

export function StatusSelect({ items, name, value }) {
  return (
    <select defaultValue={value ?? ""} name={name}>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

export function RequiredMark() {
  return (
    <span className={cx(globalStyles, "required-field-mark")} aria-hidden="true">
      *
    </span>
  );
}

function AdminTabs({ activeTab }) {
  return (
    <nav className={cx(globalStyles, "admin-tab-bar")} aria-label="Secoes do painel admin">
      <Link
        className={cx(globalStyles, activeTab === "pedidos" ? "is-active" : "")}
        href="/admin/pedidos"
      >
        Pedidos
      </Link>
      <Link
        className={cx(globalStyles, activeTab === "produtos" ? "is-active" : "")}
        href="/admin/produtos"
      >
        Produtos
      </Link>
      <Link
        className={cx(globalStyles, activeTab === "analise" ? "is-active" : "")}
        href="/admin/analise"
      >
        Analise
      </Link>
      <Link
        className={cx(globalStyles, activeTab === "financeiro" ? "is-active" : "")}
        href="/admin/financeiro"
      >
        Financeiro
      </Link>
      <Link
        className={cx(globalStyles, activeTab === "cupons" ? "is-active" : "")}
        href="/admin/cupons"
      >
        Cupons
      </Link>
    </nav>
  );
}

export function AdminSetup({ message, mode = "env" }) {
  const config = getPublicSupabaseConfig();
  const projectRef = config.projectRef || "SEU_PROJECT_REF";
  const isDatabaseIssue = mode === "database";
  const isServiceIssue = mode === "service";
  const serviceLabel = isServiceIssue ? "Servico indisponivel" : "Configuracao pendente";
  const sectionLabel = isDatabaseIssue ? "Banco pendente" : serviceLabel;
  const heading = isDatabaseIssue
    ? "Aplique a migration do Supabase."
    : isServiceIssue
      ? "Nao foi possivel carregar o painel."
      : "Ative o painel administrativo.";

  return (
    <main className={cx(globalStyles, "page-shell auth-page")}>
      <SiteHeader showAccountNav={false} />
      <section className={cx(globalStyles, "setup-panel")}>
        <p className={cx(globalStyles, "section-label")}>{sectionLabel}</p>
        <h1>{heading}</h1>
        {isDatabaseIssue ? (
          <>
            <p>
              O token do admin esta aceito e o Supabase respondeu, mas as tabelas do painel ainda
              nao existem no projeto conectado.
            </p>
            <pre className={cx(globalStyles, "setup-command-block")}>
              {`npx supabase login
npx supabase link --project-ref ${projectRef}
npx supabase db push`}
            </pre>
            <p>
              Se preferir, abra o SQL Editor no Supabase e execute
              `supabase/migrations/20260520_customer_accounts.sql`.
            </p>
          </>
        ) : isServiceIssue ? (
          <p>
            A configuracao administrativa existe, mas a consulta ao Supabase falhou. Tente novamente
            e revise os logs do servidor se o problema continuar.
          </p>
        ) : (
          <p>
            Configure `TSZR15_ADMIN_TOKEN`, a URL do Supabase e uma chave privilegiada do Supabase
            no ambiente do servidor.
          </p>
        )}
        {message ? <p className={cx(globalStyles, "form-alert")}>{message}</p> : null}
      </section>
    </main>
  );
}

export function AdminListPagination({ basePath, label, page, pageCount, pageParam }) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <nav aria-label={`Páginas de ${label}`} className={cx(globalStyles, "admin-list-pagination")}>
      {page > 1 ? (
        <Link href={`${basePath}?${pageParam}=${page - 1}`}>Anterior</Link>
      ) : (
        <span aria-disabled="true">Anterior</span>
      )}
      <strong>
        {page} / {pageCount}
      </strong>
      {page < pageCount ? (
        <Link href={`${basePath}?${pageParam}=${page + 1}`}>Próxima</Link>
      ) : (
        <span aria-disabled="true">Próxima</span>
      )}
    </nav>
  );
}

export function AdminSectionShell({ activeTab, actions = null, children, message }) {
  return (
    <main className={cx(globalStyles, "page-shell auth-page admin-page")}>
      <SiteHeader showAccountNav={false} />

      <section className={cx(globalStyles, "admin-toolbar")}>
        <div>
          <p className={cx(globalStyles, "section-label")}>Painel admin</p>
          <h1>Operacao manual TSZR15.</h1>
        </div>
        <div className={cx(globalStyles, "admin-toolbar-actions")}>
          {actions}
          <form action={adminSignOutAction}>
            <button className={cx(globalStyles, "button button-secondary")} type="submit">
              Sair
            </button>
          </form>
        </div>
      </section>

      <AdminTabs activeTab={activeTab} />

      {message ? <p className={cx(globalStyles, "form-alert admin-message")}>{message}</p> : null}

      {children}
    </main>
  );
}
