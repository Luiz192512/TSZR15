import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionCookieOptions,
  isAdminSessionValueValidAtEdge
} from "./src/admin/admin-session-edge.js";
import { getSupabasePublishableKey, getSupabaseUrl } from "./src/lib/supabase/config.js";
import { isOnlinePaymentEnabled } from "./src/payments/payment-config.js";

function isAdminPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function isPaymentPath(pathname) {
  return pathname.startsWith("/pedido/pagamento/");
}

// 404 de verdade para a tela de pagamento quando o fluxo esta desligado.
//
// A propria pagina ja chama `notFound()`, mas nesta versao do Next isso responde
// HTTP 200 com o corpo de 404: o cabecalho ja foi enviado quando o componente
// decide. O cliente via "nao encontrada" e o monitoramento via "200 OK" — e e o
// monitoramento que precisa saber se o rollback pegou.
//
// Aqui a decisao acontece antes de qualquer byte sair, entao o status e o certo.
function paymentDisabledResponse() {
  const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Pagamento indisponivel</title></head>
<body style="font-family:system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center">
<main><h1 style="font-size:1.25rem">Pagamento online indisponível</h1>
<p>Esta loja está fechando os pedidos pelo atendimento no momento.</p>
<p><a href="/pedido">Voltar ao carrinho</a> · <a href="/">Ir para a loja</a></p></main>
</body></html>`;

  return new NextResponse(body, {
    headers: { "cache-control": "no-store", "content-type": "text/html; charset=utf-8" },
    status: 404
  });
}

function addAdminSecurityHeaders(response) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "same-origin");

  return response;
}

function redirectToAdminLogin(request) {
  const redirectUrl = new URL("/entrar", request.url);
  redirectUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(ADMIN_SESSION_COOKIE, "", getAdminSessionCookieOptions({ maxAge: 0 }));

  return addAdminSecurityHeaders(response);
}

// Kept as edge middleware (not Next 16 proxy.js): the Cloudflare OpenNext
// adapter does not support the Node.js proxy runtime.
export async function middleware(request) {
  if (isPaymentPath(request.nextUrl.pathname) && !isOnlinePaymentEnabled()) {
    return paymentDisabledResponse();
  }

  const isAdminRequest = isAdminPath(request.nextUrl.pathname);

  let response = NextResponse.next({ request });

  if (isAdminRequest) {
    const adminSessionValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? "";
    const hasSignedAdminSession = await isAdminSessionValueValidAtEdge(adminSessionValue);

    if (!hasSignedAdminSession) {
      return redirectToAdminLogin(request);
    }

    return addAdminSecurityHeaders(response);
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabasePublishableKey();

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/auth/:path*",
    "/cadastrar",
    "/conta/:path*",
    "/entrar",
    "/pedido/:path*",
    "/recuperar-senha",
    "/trocar-senha"
  ]
};
