import Link from "next/link";
import { redirect } from "next/navigation";

import { signInAction } from "@/app/auth/actions.js";
import { getSafeAuthRedirectPath } from "@/src/auth/redirects.js";
import { PasswordInput } from "@/src/components/form/password-input.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function getMessage(params) {
  if (params?.status === "confirmar-email") {
    return "Cadastro criado. Confirme o email, se o Supabase exigir, e entre para concluir seus dados.";
  }

  if (params?.status === "senha-alterada") {
    return "Senha alterada. Entre novamente com a nova senha.";
  }

  return typeof params?.error === "string" ? params.error : "";
}

export default async function SignInPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const nextPath = getSafeAuthRedirectPath(params?.next, "/conta");
  const message = getMessage(params);

  if (user && nextPath !== "/admin") {
    redirect(nextPath);
  }

  return (
    <main className="page-shell auth-page">
      <SiteHeader user={user} />

      <section className="auth-shell">
        <form action={signInAction} className="auth-card">
          <p className="section-label">Conta TSZR15</p>
          <h1>Entrar para comprar mais rapido.</h1>
          <p className="helper-text">
            Use sua conta para preencher dados de entrega e finalizar o pedido pelo WhatsApp.
          </p>

          {message ? <p className="form-alert">{message}</p> : null}

          <input name="next" type="hidden" value={nextPath} />

          <label>
            <span>E-mail ou admin</span>
            <input autoComplete="username" name="email" placeholder="voce@email.com ou admin" required type="text" />
          </label>

          <PasswordInput
            autoComplete="current-password"
            label="Senha"
            name="password"
            placeholder="Sua senha"
            required
          />

          <button className="button button-primary" type="submit">
            Entrar
          </button>

          <p className="auth-switch">
            Ainda nao tem conta? <Link href="/cadastrar">Cadastrar cliente</Link>
          </p>
          <p className="auth-switch">
            Esqueceu a senha? <Link href="/recuperar-senha">Recuperar acesso</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
