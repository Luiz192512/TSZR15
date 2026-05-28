import Link from "next/link";

import { signUpAction } from "@/app/auth/actions.js";
import { ASSISTED_PURCHASE_CONSENT_TEXT } from "@/src/customer/customer-data.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { CepAddressFields } from "@/src/components/form/cep-address-fields.js";
import { PasswordInput } from "@/src/components/form/password-input.js";
import { SanitizedInput } from "@/src/components/form/sanitized-input.js";
import { phonePattern, taxIdPattern } from "@/src/customer/field-validation.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

export default async function SignUpPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const message = params?.error ? decodeURIComponent(params.error) : "";

  return (
    <main className="page-shell auth-page">
      <SiteHeader user={user} />

      <section className="auth-shell wide">
        <form action={signUpAction} className="auth-card account-form-card">
          <p className="section-label">Cadastro de cliente</p>
          <h1>Salve seus dados para fechar pedidos TSZR15.</h1>
          <p className="helper-text">
            O cadastro guarda seus dados de compra e entrega. A origem interna do pedido continua
            restrita a operação TSZR15.
          </p>

          {message ? <p className="form-alert">{message}</p> : null}

          <div className="form-grid">
            <label>
              <span>Nome completo</span>
              <input autoComplete="name" name="fullName" required />
            </label>
            <label>
              <span>CPF/CNPJ</span>
              <SanitizedInput
                inputMode="numeric"
                name="taxId"
                pattern={taxIdPattern}
                placeholder="Opcional quando nao exigido"
                sanitizer="taxId"
                title="Use somente numeros, pontos, barra e hifen."
              />
            </label>
            <label>
              <span>Email</span>
              <input autoComplete="email" name="email" required type="email" />
            </label>
            <PasswordInput autoComplete="new-password" label="Senha" minLength={6} name="password" required />
            <label>
              <span>WhatsApp</span>
              <SanitizedInput
                autoComplete="tel"
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
                autoComplete="tel"
                inputMode="tel"
                name="phone"
                pattern={phonePattern}
                sanitizer="phone"
                title="Use somente numeros e pontuacao de telefone."
              />
            </label>
            <CepAddressFields />
          </div>

          <label className="consent-box account-consent">
            <input name="dataConsent" required type="checkbox" />
            <span>{ASSISTED_PURCHASE_CONSENT_TEXT}</span>
          </label>

          <button className="button button-primary" type="submit">
            Criar conta
          </button>

          <p className="auth-switch">
            Ja tem conta? <Link href="/entrar">Entrar</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
