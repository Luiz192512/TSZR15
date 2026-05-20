import Link from "next/link";

import { signInAction } from "@/app/auth/actions.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function getMessage(params) {
  if (params?.status === "confirmar-email") {
    return "Cadastro criado. Confirme o email, se o Supabase exigir, e entre para concluir seus dados.";
  }

  return params?.error ? decodeURIComponent(params.error) : "";
}

export default async function SignInPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const nextPath = params?.next ?? "/conta";
  const message = getMessage(params);

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
            <span>Email</span>
            <input autoComplete="username" inputMode="email" name="email" placeholder="voce@email.com" required type="text" />
          </label>

          <label>
            <span>Senha</span>
            <input autoComplete="current-password" name="password" placeholder="Sua senha" required type="password" />
          </label>

          <button className="button button-primary" type="submit">
            Entrar
          </button>

          <p className="auth-switch">
            Ainda nao tem conta? <Link href="/cadastrar">Cadastrar cliente</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
