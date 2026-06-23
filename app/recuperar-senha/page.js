import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";

import { requestPasswordResetAction } from "@/app/auth/actions.js";
import { SiteHeader } from "@/src/components/site-header.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function getMessage(params) {
  if (params?.status === "enviado") {
    return "Se o email existir no cadastro, o Supabase enviara um link para trocar a senha.";
  }

  return typeof params?.error === "string" ? params.error : "";
}

export default async function RecoverPasswordPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const message = getMessage(params);

  return (
    <main className={cx(globalStyles, "page-shell auth-page")}>
      <SiteHeader user={user} />

      <section className={cx(globalStyles, "auth-shell")}>
        <form action={requestPasswordResetAction} className={cx(globalStyles, "auth-card")}>
          <p className={cx(globalStyles, "section-label")}>Recuperar senha</p>
          <h1>Receba um link para voltar a acessar.</h1>
          <p className={cx(globalStyles, "helper-text")}>
            Informe o email da conta TSZR15. O link abre a tela de troca de senha.
          </p>

          {message ? <p className={cx(globalStyles, "form-alert")}>{message}</p> : null}

          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              name="email"
              placeholder="voce@email.com"
              required
              type="email"
            />
          </label>

          <button className={cx(globalStyles, "button button-primary")} type="submit">
            Enviar link
          </button>

          <p className={cx(globalStyles, "auth-switch")}>
            Lembrou a senha? <Link href="/entrar">Entrar</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
