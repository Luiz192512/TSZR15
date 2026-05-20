import Link from "next/link";

import { signUpAction } from "@/app/auth/actions.js";
import { ASSISTED_PURCHASE_CONSENT_TEXT } from "@/src/customer/customer-data.js";
import { SiteHeader } from "@/src/components/site-header.js";
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
              <input name="taxId" placeholder="Opcional quando nao exigido" />
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
              <input autoComplete="tel" name="whatsapp" required />
            </label>
            <label>
              <span>Telefone opcional</span>
              <input autoComplete="tel" name="phone" />
            </label>
            <label>
              <span>CEP</span>
              <input autoComplete="postal-code" name="cep" required />
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
              <input autoComplete="address-level1" maxLength={2} name="state" required />
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
