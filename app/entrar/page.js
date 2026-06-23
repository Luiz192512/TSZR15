import globalStyles from "@/src/styles/storefront-styles.js";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signInAction } from "@/app/auth/actions.js";
import { getSafeAuthRedirectPath } from "@/src/auth/redirects.js";
import { PasswordInput } from "@/src/components/form/password-input.js";
import { PendingSubmitButton } from "@/src/components/form/pending-submit-button.js";
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
    <main className={cx(globalStyles, "page-shell auth-page")}>
      <SiteHeader user={user} />

      <section className={cx(globalStyles, "auth-shell")}>
        <form action={signInAction} className={cx(globalStyles, "auth-card login-card")}>
          <p className={cx(globalStyles, "section-label")}>Conta TSZR15</p>
          <h1>Entre para continuar.</h1>
          <p className={cx(globalStyles, "helper-text")}>
            Use sua conta para preencher dados de entrega e finalizar o pedido pelo WhatsApp.
          </p>

          {message ? <p className={cx(globalStyles, "form-alert")}>{message}</p> : null}

          <input name="next" type="hidden" value={nextPath} />

          <label>
            <span>E-mail ou admin</span>
            <input
              autoComplete="username"
              name="email"
              placeholder="voce@email.com ou admin"
              required
              type="text"
            />
          </label>

          <PasswordInput
            autoComplete="current-password"
            className=""
            label="Senha"
            name="password"
            placeholder="Sua senha"
            required
          />

          <PendingSubmitButton pendingLabel="Entrando...">Entrar</PendingSubmitButton>

          <p className={cx(globalStyles, "auth-switch")}>
            Ainda não tem conta? <Link href="/cadastrar">Criar conta</Link>
          </p>
          <p className={cx(globalStyles, "auth-switch")}>
            Esqueceu a senha? <Link href="/recuperar-senha">Recuperar acesso</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
