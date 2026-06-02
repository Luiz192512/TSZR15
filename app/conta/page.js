import Link from "next/link";
import { redirect } from "next/navigation";

import {
  saveAccountAddressAction,
  saveAccountProfileAction,
  setDefaultAddressAction,
  signOutAction
} from "@/app/auth/actions.js";
import {
  claimCustomerOrderAction,
  submitOrderItemReviewAction
} from "@/app/conta/actions.js";
import {
  ASSISTED_PURCHASE_CONSENT_TEXT,
  buildAddressLine,
  getCurrentCustomerSnapshot
} from "@/src/customer/customer-data.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { CepAddressFields } from "@/src/components/form/cep-address-fields.js";
import { PendingSubmitButton } from "@/src/components/form/pending-submit-button.js";
import { SanitizedInput } from "@/src/components/form/sanitized-input.js";
import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";
import { phonePattern, taxIdPattern } from "@/src/customer/field-validation.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";
import { getCustomerAccountOrders } from "@/src/reviews/order-reviews.js";
import { getReviewStatusLabel } from "@/src/reviews/review-utils.js";
import {
  getStatusLabel,
  operationalStatuses,
  paymentStatuses
} from "@/src/orders/status.js";

function getStatusMessage(params) {
  if (params?.status === "cadastrado") {
    return "Conta criada. Confira seus dados antes de fazer o proximo pedido.";
  }

  if (params?.status === "salvo") {
    return "Dados salvos para preencher seus proximos pedidos.";
  }

  if (params?.status === "pedido-vinculado") {
    return "Pedido vinculado a sua conta.";
  }

  if (params?.status === "avaliacao-enviada") {
    return "Avaliacao enviada. Ela aparece publicamente depois da aprovacao.";
  }

  return params?.error ? decodeURIComponent(params.error) : "";
}

function formatCurrency(cents, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    currency,
    style: "currency"
  }).format((cents ?? 0) / 100);
}

function formatDate(value) {
  if (!value) {
    return "Data nao informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short"
  }).format(new Date(value));
}

function Stars({ rating = 0 }) {
  return (
    <span className="review-stars" aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span className={index < rating ? "is-filled" : ""} key={index}>
          {"\u2605"}
        </span>
      ))}
    </span>
  );
}

function ReviewForm({ item, order, profile }) {
  return (
    <form
      action={submitOrderItemReviewAction}
      className="account-review-form"
      encType="multipart/form-data"
    >
      <input name="orderId" type="hidden" value={order.id} />
      <input name="orderItemId" type="hidden" value={item.id} />
      <input name="publicName" type="hidden" value={profile?.full_name ?? ""} />

      <fieldset className="star-rating-field">
        <legend>Nota do produto</legend>
        {[5, 4, 3, 2, 1].map((rating) => (
          <label data-rating={rating} key={rating}>
            <input name="reviewRating" required type="radio" value={rating} />
            <span>{"\u2605".repeat(rating)}</span>
          </label>
        ))}
      </fieldset>

      <label>
        <span>Comentario</span>
        <textarea
          maxLength={1200}
          minLength={8}
          name="reviewComment"
          placeholder="Conte como ficou na sua R15, acabamento, prazo e atendimento."
          required
        />
      </label>

      <label className="review-photo-field">
        <span>Fotos opcionais</span>
        <input
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          name="reviewPhotos"
          type="file"
        />
        <small>Ate 5 fotos, 5MB cada.</small>
      </label>

      <PendingSubmitButton pendingLabel="Enviando avaliacao...">
        Enviar avaliacao
      </PendingSubmitButton>
    </form>
  );
}

function AccountOrderCard({ order, profile }) {
  return (
    <article className="account-order-card">
      <div className="account-order-head">
        <div>
          <strong>{order.orderNumber}</strong>
          <span>{formatDate(order.createdAt)}</span>
        </div>
        <div>
          <span>{getStatusLabel(order.operationalStatus, operationalStatuses)}</span>
          <strong>{formatCurrency(order.totalCents, order.currency)}</strong>
        </div>
      </div>

      <div className="account-order-meta">
        <span>{getStatusLabel(order.paymentStatus, paymentStatuses)}</span>
        <span>{order.items.length} item(ns)</span>
      </div>

      <div className="account-order-items">
        {order.items.map((item) => {
          const canSubmitReview = order.isDelivered && (!item.review || item.review.status === "rejected");

          return (
            <section className="account-order-item" key={item.id}>
              <div className="account-order-item-head">
                <div>
                  <strong>{item.productName}</strong>
                  <span>
                    {item.quantity}x - {item.variation}
                  </span>
                </div>
                <Link href={`/produto/${item.productSlug}`}>Ver produto</Link>
              </div>

              {item.review ? (
                <div className={`account-review-status is-${item.review.status}`}>
                  <div>
                    <Stars rating={item.review.rating} />
                    <strong>{getReviewStatusLabel(item.review.status)}</strong>
                  </div>
                  <p>{item.review.comment}</p>
                  {item.review.photos.length > 0 ? (
                    <div className="account-review-photo-row">
                      {item.review.photos.map((photo) => (
                        <img alt="" key={photo.id} src={photo.url} />
                      ))}
                    </div>
                  ) : null}
                  {item.review.status === "rejected" && item.review.moderationNote ? (
                    <small>{item.review.moderationNote}</small>
                  ) : null}
                </div>
              ) : null}

              {canSubmitReview ? <ReviewForm item={item} order={order} profile={profile} /> : null}
            </section>
          );
        })}
      </div>
    </article>
  );
}

function AccountOrders({ accountOrders, profile }) {
  return (
    <div className="account-orders-stack">
      <section className="account-panel">
        <div className="account-panel-heading">
          <p className="section-label">Pedidos em andamento</p>
          <h2>Acompanhe o que ainda esta em processo.</h2>
        </div>
        {accountOrders.inProgressOrders.length === 0 ? (
          <p className="helper-text">Nao ha pedidos em andamento vinculados a esta conta.</p>
        ) : (
          accountOrders.inProgressOrders.map((order) => (
            <AccountOrderCard key={order.id} order={order} profile={profile} />
          ))
        )}
      </section>

      <section className="account-panel">
        <div className="account-panel-heading">
          <p className="section-label">Pedidos concluidos</p>
          <h2>Avalie os itens entregues.</h2>
        </div>
        {accountOrders.completedOrders.length === 0 ? (
          <p className="helper-text">Quando um pedido chegar em entregue, a avaliacao aparece aqui.</p>
        ) : (
          accountOrders.completedOrders.map((order) => (
            <AccountOrderCard key={order.id} order={order} profile={profile} />
          ))
        )}
      </section>
    </div>
  );
}

function ClaimOrderForm() {
  return (
    <form action={claimCustomerOrderAction} className="account-panel claim-order-form">
      <div className="account-panel-heading">
        <p className="section-label">Vincular pedido</p>
        <h2>Comprou sem entrar na conta?</h2>
        <p className="helper-text">
          Use o numero do pedido e o WhatsApp, CPF ou CNPJ usado na compra.
        </p>
      </div>

      <label>
        <span>Numero do pedido</span>
        <input name="claimOrderNumber" placeholder="TSZ-..." required />
      </label>
      <label>
        <span>WhatsApp ou CPF/CNPJ</span>
        <input name="claimContact" required />
      </label>

      <PendingSubmitButton pendingLabel="Vinculando pedido...">
        Vincular pedido
      </PendingSubmitButton>
    </form>
  );
}

function getActiveAccountTab(params) {
  if (["dados", "enderecos", "configuracoes"].includes(params?.tab)) {
    return params.tab;
  }

  return "inicio";
}

function AccountTabs({ activeTab }) {
  const tabs = [
    ["inicio", "Inicio"],
    ["dados", "Dados pessoais"],
    ["enderecos", "Enderecos"],
    ["configuracoes", "Configuracoes"]
  ];

  return (
    <nav className="account-tab-bar" aria-label="Secoes da conta">
      {tabs.map(([tab, label]) => (
        <Link
          className={activeTab === tab ? "is-active" : ""}
          href={tab === "inicio" ? "/conta" : `/conta?tab=${tab}`}
          key={tab}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function AccountOverview({ accountOrders, addresses, profile, suggestions }) {
  const defaultAddress = addresses.find((address) => address.is_default) ?? addresses[0];

  return (
    <div className="account-main-stack">
      <section className="account-panel account-overview-panel">
        <div className="account-panel-heading">
          <p className="section-label">Inicio</p>
          <h2>Resumo da sua conta.</h2>
        </div>
        <div className="account-overview-grid">
          <div>
            <span>Cliente</span>
            <strong>{profile.full_name || "Nome pendente"}</strong>
          </div>
          <div>
            <span>Contato</span>
            <strong>{profile.whatsapp || profile.phone || "Contato pendente"}</strong>
          </div>
          <div>
            <span>Endereco padrao</span>
            <strong>{defaultAddress ? defaultAddress.label : "Cadastre um endereco"}</strong>
          </div>
          <div>
            <span>Pedidos</span>
            <strong>
              {accountOrders.inProgressOrders.length + accountOrders.completedOrders.length}
            </strong>
          </div>
        </div>
      </section>

      <section className="account-panel">
        <div className="account-panel-heading">
          <p className="section-label">Sugestoes</p>
          <h2>Itens que combinam com sua R15.</h2>
        </div>
        <div className="account-suggestion-grid">
          {suggestions.map((product) => (
            <Link className="account-suggestion-card" href={`/produto/${product.slug}`} key={product.id}>
              <span>{product.storefrontCategoryIds?.[0] ?? "R15"}</span>
              <strong>{product.name}</strong>
            </Link>
          ))}
        </div>
      </section>

      <AccountOrders accountOrders={accountOrders} profile={profile} />
    </div>
  );
}

function PersonalDataForm({ profile, user }) {
  return (
    <form action={saveAccountProfileAction} className="auth-card account-form-card compact-account-form">
      <div className="account-panel-heading">
        <p className="section-label">Dados pessoais</p>
        <h2>Atualize seus dados principais.</h2>
      </div>
      <div className="form-grid">
        <label>
          <span>Nome completo</span>
          <input defaultValue={profile.full_name ?? ""} name="fullName" required />
        </label>
        <label>
          <span>CPF/CNPJ</span>
          <SanitizedInput
            defaultValue={profile.tax_id ?? ""}
            inputMode="numeric"
            name="taxId"
            pattern={taxIdPattern}
            required
            sanitizer="taxId"
            title="Use somente numeros, pontos, barra e hifen."
          />
        </label>
        <label>
          <span>Email</span>
          <input defaultValue={profile.email ?? user.email ?? ""} name="email" required type="email" />
        </label>
        <label>
          <span>WhatsApp</span>
          <SanitizedInput
            defaultValue={profile.whatsapp ?? ""}
            inputMode="tel"
            name="whatsapp"
            pattern={phonePattern}
            required
            sanitizer="phone"
            title="Use somente numeros e pontuacao de telefone."
          />
        </label>
        <label>
          <span>Telefone opcional</span>
          <SanitizedInput
            defaultValue={profile.phone ?? ""}
            inputMode="tel"
            name="phone"
            pattern={phonePattern}
            sanitizer="phone"
            title="Use somente numeros e pontuacao de telefone."
          />
        </label>
      </div>
      <PendingSubmitButton pendingLabel="Salvando dados...">
        Salvar dados
      </PendingSubmitButton>
    </form>
  );
}

function AddressBook({ addresses, selectedAddressId }) {
  const selectedAddress =
    addresses.find((address) => address.id === selectedAddressId) ?? null;

  return (
    <div className="account-main-stack">
      <section className="account-panel">
        <div className="account-panel-heading">
          <p className="section-label">Enderecos</p>
          <h2>Cadastre varios enderecos.</h2>
          <Link className="button button-secondary" href="/conta?tab=enderecos">
            Novo
          </Link>
        </div>
        {addresses.length === 0 ? (
          <p className="helper-text">Nenhum endereco cadastrado.</p>
        ) : (
          <div className="account-address-grid">
            {addresses.map((address) => (
              <article className="account-address-card" key={address.id}>
                <div>
                  <strong>{address.label}</strong>
                  {address.is_default ? <span>Padrao</span> : null}
                </div>
                <p>{buildAddressLine(address)}</p>
                <div className="account-address-actions">
                  <Link href={`/conta?tab=enderecos&endereco=${encodeURIComponent(address.id)}`}>
                    Editar
                  </Link>
                  {!address.is_default ? (
                    <form action={setDefaultAddressAction}>
                      <input name="addressId" type="hidden" value={address.id} />
                      <button type="submit">Usar como padrao</button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <form action={saveAccountAddressAction} className="auth-card account-form-card compact-account-form">
        <div className="account-panel-heading">
          <p className="section-label">{selectedAddress ? "Editar endereco" : "Novo endereco"}</p>
          <h2>Dados de entrega.</h2>
        </div>
        <input name="addressId" type="hidden" value={selectedAddress?.id ?? ""} />
        <input name="isFirstAddress" type="hidden" value={addresses.length === 0 ? "true" : "false"} />
        <div className="form-grid">
          <label>
            <span>Apelido</span>
            <input defaultValue={selectedAddress?.label ?? ""} name="addressLabel" placeholder="Casa, trabalho..." />
          </label>
          <CepAddressFields
            defaults={{
              cep: selectedAddress?.cep ?? "",
              city: selectedAddress?.city ?? "",
              complement: selectedAddress?.complement ?? "",
              district: selectedAddress?.district ?? "",
              number: selectedAddress?.number ?? "",
              referencePoint: selectedAddress?.reference_point ?? "",
              state: selectedAddress?.state ?? "",
              street: selectedAddress?.street ?? ""
            }}
            referencePointClassName="span-all"
          />
        </div>
        <label className="admin-toggle-row span-all">
          <input
            defaultChecked={selectedAddress?.is_default ?? addresses.length === 0}
            name="addressIsDefault"
            type="checkbox"
          />
          <span>Endereco padrao</span>
        </label>
        <label className="consent-box account-consent">
          <input defaultChecked name="dataConsent" required type="checkbox" />
          <span>{ASSISTED_PURCHASE_CONSENT_TEXT}</span>
        </label>
        <PendingSubmitButton pendingLabel="Salvando endereco...">
          Salvar endereco
        </PendingSubmitButton>
      </form>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="account-main-stack">
      <section className="account-panel account-settings-panel">
        <div className="account-panel-heading">
          <p className="section-label">Configuracoes</p>
          <h2>Acesso e seguranca.</h2>
        </div>
        <div className="account-settings-actions">
          <Link className="button button-secondary" href="/trocar-senha">
            Trocar senha
          </Link>
          <form action={signOutAction}>
            <button className="button button-secondary" type="submit">
              Sair
            </button>
          </form>
        </div>
      </section>
      <ClaimOrderForm />
    </div>
  );
}

export default async function AccountPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const snapshot = await getCurrentCustomerSnapshot(supabase);

  if (!snapshot.supabaseConfigured) {
    return (
      <main className="page-shell auth-page">
        <SiteHeader />
        <section className="setup-panel">
          <p className="section-label">Supabase pendente</p>
          <h1>Configure o Supabase para ativar contas de cliente.</h1>
          <p>
            Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
            ou sincronize as variaveis da integracao Supabase/Vercel no ambiente do servidor.
            Depois aplique a migracao SQL e reinicie o servidor.
          </p>
        </section>
      </main>
    );
  }

  if (!snapshot.user) {
    redirect("/entrar?next=/conta");
  }

  const profile = snapshot.profile ?? {};
  const addresses = snapshot.addresses ?? [];
  const message = getStatusMessage(params);
  const activeTab = getActiveAccountTab(params);
  let accountOrders = {
    completedOrders: [],
    inProgressOrders: [],
    isConfigured: true
  };
  let accountOrderError = "";

  try {
    accountOrders = await getCustomerAccountOrders({ user: snapshot.user });
  } catch (error) {
    accountOrderError = error.message;
  }

  const suggestionsCatalog = await getPublicCatalogProductsForStorefront();
  const suggestions = suggestionsCatalog.products.slice(0, 4);

  return (
    <main className="page-shell auth-page">
      <SiteHeader user={snapshot.user} />

      <section className="account-layout account-dashboard-layout">
        <div className="account-summary">
          <p className="section-label">Minha conta</p>
          <h1>Perfil TSZR15.</h1>
          <p>Acompanhe compras, enderecos, dados e avaliacoes.</p>
          <AccountTabs activeTab={activeTab} />
        </div>

        <div className="account-main-stack">
          {message ? <p className="form-alert">{message}</p> : null}

          {activeTab === "dados" ? (
            <PersonalDataForm profile={profile} user={snapshot.user} />
          ) : activeTab === "enderecos" ? (
            <AddressBook addresses={addresses} selectedAddressId={params?.endereco ?? ""} />
          ) : activeTab === "configuracoes" ? (
            <SettingsPanel />
          ) : accountOrderError ? (
            <section className="account-panel">
              <p className="section-label">Pedidos indisponiveis</p>
              <h2>Rode a migration de avaliacoes para ativar esta area.</h2>
              <p className="helper-text">{accountOrderError}</p>
            </section>
          ) : (
            <AccountOverview
              accountOrders={accountOrders}
              addresses={addresses}
              profile={profile}
              suggestions={suggestions}
            />
          )}
        </div>
      </section>
    </main>
  );
}
