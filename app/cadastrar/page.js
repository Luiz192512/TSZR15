import Link from "next/link";

import { signUpAction } from "@/app/auth/actions.js";
import { SiteHeader } from "@/src/components/site-header.js";
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
        <form action={signUpAction} className="auth-card account-form-card signup-card">
          <p className="section-label">Cadastro de cliente</p>
          <h1>Crie sua conta TSZR15.</h1>
          <p className="helper-text">O endereco fica no perfil, depois do cadastro.</p>

          {message ? <p className="form-alert">{message}</p> : null}

          <div className="form-grid compact-signup-grid">
            <label>
              <span>Nome completo</span>
              <input autoComplete="name" name="fullName" required />
            </label>
            <label>
              <span>CPF</span>
              <SanitizedInput
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
              <input autoComplete="email" name="email" required type="email" />
            </label>
            <label>
              <span>Numero</span>
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
            <PasswordInput
              autoComplete="new-password"
              label="Senha"
              minLength={6}
              name="password"
              required
            />
          </div>

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
