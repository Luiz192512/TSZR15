import Link from "next/link";

import { signUpAction } from "@/app/auth/actions.js";
import { ASSISTED_PURCHASE_CONSENT_TEXT } from "@/src/customer/customer-data.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { SanitizedInput } from "@/src/components/form/sanitized-input.js";
import {
  cepPattern,
  phonePattern,
  statePattern,
  taxIdPattern
} from "@/src/customer/field-validation.js";
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
            restrita a operacao TSZR15.
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
            <label>
              <span>Senha</span>
              <input autoComplete="new-password" minLength={6} name="password" required type="password" />
            </label>
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
            <label>
              <span>CEP</span>
              <SanitizedInput
                autoComplete="postal-code"
                inputMode="numeric"
                name="cep"
                pattern={cepPattern}
                required
                sanitizer="cep"
                title="Use 8 numeros, com ou sem hifen."
              />
            </label>
            <label>
              <span>Rua</span>
              <input autoComplete="address-line1" name="street" required />
            </label>
            <label>
              <span>Numero</span>
              <input name="number" required />
            </label>
            <label>
              <span>Bairro</span>
              <input name="district" required />
            </label>
            <label>
              <span>Cidade</span>
              <input autoComplete="address-level2" name="city" required />
            </label>
            <label>
              <span>UF</span>
              <SanitizedInput
                autoComplete="address-level1"
                maxLength={2}
                name="state"
                pattern={statePattern}
                required
                sanitizer="state"
                title="Use a sigla do estado com 2 letras."
              />
            </label>
            <label>
              <span>Complemento</span>
              <input autoComplete="address-line2" name="complement" />
            </label>
            <label>
              <span>Ponto de referencia</span>
              <input name="referencePoint" />
            </label>
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
