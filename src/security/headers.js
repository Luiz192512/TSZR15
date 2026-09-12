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
const scriptSrc = [
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://sdk.mercadopago.com",
  isDevelopment ? " 'unsafe-eval'" : ""
].join("");

// Pix e resolvido inteiro no servidor: a pagina so exibe o QR (uma imagem em
// data: URI) e faz polling na propria origem. Por isso o unico host do
// provedor liberado e a API, e nada de script-src, frame-src ou SDK externo.
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
