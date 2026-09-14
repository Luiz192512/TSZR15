// O React em modo desenvolvimento usa eval() para reconstruir callstacks, e o
// Next abre um WebSocket para o hot reload. Sem estas duas liberacoes o
// `next dev` sobe com a pagina renderizada mas sem interatividade — a arvore
// de componentes cliente nao hidrata e nenhum clique responde.
//
// Producao NAO recebe nenhuma delas: o React nunca usa eval() em producao, e o
// afrouxamento aqui e o vetor classico de XSS. A separacao e por
// NODE_ENV === "development", avaliado no build.
const isDevelopment = process.env.NODE_ENV === "development";

// sdk.mercadopago.com entra por causa do CARTAO: a tokenizacao acontece no
// navegador para que numero e CVV nunca cheguem a este servidor. Esse e o
// preco de nao tocar em dado de cartao — Pix e boleto nao precisam de SDK.
//
// MUDANCA DE POLITICA, nao so de codigo: `www.mercadopago.com` entra para o
// script de IMPRESSAO DIGITAL do dispositivo (`/v2/security.js`, 4,9 KB).
//
// O que ele passa a poder fazer, em portugues claro: ler caracteristicas do
// navegador de quem esta pagando e mandar esse perfil para o provedor, que
// devolve um identificador. E rastreamento de dispositivo, e o cliente nao e
// perguntado.
//
// Por que aceitamos: esse identificador e o campo de maior peso na analise de
// cartao. Sem ele o provedor nao distingue o comprador de sempre de um cartao
// roubado e recusa por precaucao — o custo cai sobre a loja, em venda perdida.
//
// O ESCOPO E MENOR do que parecia. Conferido lendo o script inteiro:
//   - nao abre iframe, entao `frame-src` continua 'none'
//   - nao usa imagem nem canvas, entao `img-src` nao muda
//   - so contata `api.mercadopago.com`, que ja estava liberado
// A primeira versao desta mudanca liberava `*.mercadolibre.com` em tres
// diretivas por suposicao; a leitura do script mostrou que nada disso e
// necessario.
//
// Pix e boleto nao carregam nada disso: o script so e injetado quando a aba de
// cartao abre. Quem paga por esses meios nao e alcancado.
const scriptSrc = [
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://sdk.mercadopago.com https://www.mercadopago.com",
  isDevelopment ? " 'unsafe-eval'" : ""
].join("");

// Pix e resolvido inteiro no servidor: a pagina so exibe o QR (uma imagem em
// data: URI) e faz polling na propria origem.
//
// `api.mercadopago.com` cobre TAMBEM a impressao digital do dispositivo: o
// script de seguranca do provedor manda o perfil coletado para
// `/web_device` nesse mesmo host. Conferido lendo o script: ele nao contata
// nenhum outro dominio.
const connectSrc = [
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://viacep.com.br https://vitals.vercel-insights.com https://api.mercadopago.com",
  isDevelopment ? " ws://localhost:* http://localhost:*" : ""
].join("");

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  connectSrc,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests"
].join("; ");

export const securityHeaders = Object.freeze([
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload"
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
  }
]);
