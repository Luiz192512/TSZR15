import Link from "next/link";

import { updatePasswordAction } from "@/app/auth/actions.js";
import { PasswordInput } from "@/src/components/form/password-input.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function getMessage(params, user) {
  if (params?.error) {
    return params.error;
  }

  if (!user) {
    return "Para trocar a senha, abra o link enviado por email ou entre na sua conta.";
  }

  return "";
}

export default async function ChangePasswordPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const message = getMessage(params, user);

  return (
    <main className="page-shell auth-page">
      <SiteHeader user={user} />

      <section className="auth-shell">
        <form action={updatePasswordAction} className="auth-card">
          <p className="section-label">Trocar senha</p>
          <h1>Defina uma nova senha para sua conta.</h1>
          <p className="helper-text">
            Use uma senha com pelo menos 6 caracteres. Depois voce entra novamente.
          </p>

          {message ? <p className="form-alert">{message}</p> : null}

          <PasswordInput
            autoComplete="new-password"
            label="Nova senha"
            minLength={6}
            name="password"
            required
          />
          <PasswordInput
            autoComplete="new-password"
            label="Confirmar senha"
            minLength={6}
            name="passwordConfirmation"
            required
          />

          <button className="button button-primary" disabled={!user} type="submit">
            Salvar nova senha
          </button>

          <p className="auth-switch">
            Precisa de outro link? <Link href="/recuperar-senha">Recuperar senha</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
