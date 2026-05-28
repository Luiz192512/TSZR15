import Link from "next/link";
import { redirect } from "next/navigation";

import { saveAccountAction, signOutAction } from "@/app/auth/actions.js";
import { ASSISTED_PURCHASE_CONSENT_TEXT } from "@/src/customer/customer-data.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { CepAddressFields } from "@/src/components/form/cep-address-fields.js";
import { SanitizedInput } from "@/src/components/form/sanitized-input.js";
import { getCurrentCustomerSnapshot } from "@/src/customer/customer-data.js";
import { phonePattern, taxIdPattern } from "@/src/customer/field-validation.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function getStatusMessage(params) {
  if (params?.status === "cadastrado") {
    return "Conta criada. Confira seus dados antes de fazer o proximo pedido.";
  }

  if (params?.status === "salvo") {
    return "Dados salvos para preencher seus proximos pedidos.";
  }

  return params?.error ? decodeURIComponent(params.error) : "";
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
  const address = snapshot.address ?? {};
  const message = getStatusMessage(params);

  return (
    <main className="page-shell auth-page">
      <SiteHeader user={snapshot.user} />

      <section className="account-layout">
        <div className="account-summary">
          <p className="section-label">Minha conta</p>
          <h1>Dados para compra e entrega.</h1>
          <p>
            Estes dados ficam na conta do cliente e alimentam o checkout TSZR15. A operacao
            interna usa o consentimento para cumprir o pedido sem expor a origem ao cliente.
          </p>

          <form action={signOutAction}>
            <button className="button button-secondary" type="submit">
              Sair
            </button>
          </form>

          <Link className="button button-secondary" href="/trocar-senha">
            Trocar senha
          </Link>
        </div>

        <form action={saveAccountAction} className="auth-card account-form-card">
          {message ? <p className="form-alert">{message}</p> : null}

          <input name="addressId" type="hidden" value={address.id ?? ""} />

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
                sanitizer="taxId"
                title="Use somente numeros, pontos, barra e hifen."
              />
            </label>
            <label>
              <span>Email</span>
              <input defaultValue={profile.email ?? snapshot.user.email ?? ""} name="email" required type="email" />
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
            <CepAddressFields
              defaults={{
                cep: address.cep ?? "",
                city: address.city ?? "",
                complement: address.complement ?? "",
                district: address.district ?? "",
                number: address.number ?? "",
                referencePoint: address.reference_point ?? "",
                state: address.state ?? "",
                street: address.street ?? ""
              }}
              referencePointClassName="span-all"
            />
          </div>

          <label className="consent-box account-consent">
            <input defaultChecked name="dataConsent" required type="checkbox" />
            <span>{ASSISTED_PURCHASE_CONSENT_TEXT}</span>
          </label>

          <button className="button button-primary" type="submit">
            Salvar dados
          </button>
        </form>
      </section>
    </main>
  );
}
