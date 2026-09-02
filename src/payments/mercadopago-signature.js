// Validação da assinatura do webhook do Mercado Pago.
//
// O provedor manda dois cabeçalhos:
//   x-signature: ts=<epoch>,v1=<hmac hex>
//   x-request-id: <uuid>
//
// O HMAC-SHA256 é calculado sobre o manifesto
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// com o segredo configurado no painel do provedor.
//
// Web Crypto em vez de node:crypto porque este código roda no Worker da
// Cloudflare, onde o módulo do Node não existe.

const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

export function parseSignatureHeader(header) {
  const parts = String(header ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed = {};

  for (const part of parts) {
    const separator = part.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    parsed[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }

  return {
    signature: parsed.v1 ?? "",
    timestamp: parsed.ts ?? ""
  };
}

export function buildSignatureManifest({ dataId, requestId, timestamp }) {
  // O provedor documenta o manifesto com os campos nesta ordem e cada um
  // terminado por ";". Campo ausente entra vazio, não é omitido.
  return `id:${dataId ?? ""};request-id:${requestId ?? ""};ts:${timestamp ?? ""};`;
}

async function hmacSha256Hex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));

  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Comparação em tempo constante: comparar com === vaza, pelo tempo de resposta,
// quantos bytes do HMAC o atacante acertou.
function timingSafeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");

  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

/**
 * @returns {Promise<{ valid: boolean, reason: string }>}
 */
export async function verifyWebhookSignature({
  dataId,
  nowSeconds = Math.floor(Date.now() / 1000),
  requestId,
  secret,
  signatureHeader
}) {
  if (!secret) {
    return { reason: "segredo do webhook nao configurado", valid: false };
  }

  const { signature, timestamp } = parseSignatureHeader(signatureHeader);

  if (!signature || !timestamp) {
    return { reason: "cabecalho x-signature incompleto", valid: false };
  }

  const timestampSeconds = Number(timestamp);

  if (!Number.isFinite(timestampSeconds)) {
    return { reason: "timestamp da assinatura invalido", valid: false };
  }

  // Janela de replay: assinatura válida capturada ontem não pode confirmar um
  // pagamento hoje.
  if (Math.abs(nowSeconds - timestampSeconds) > MAX_SIGNATURE_AGE_SECONDS) {
    return { reason: "assinatura fora da janela de validade", valid: false };
  }

  const expected = await hmacSha256Hex(
    secret,
    buildSignatureManifest({ dataId, requestId, timestamp })
  );

  if (!timingSafeEqual(expected, signature.toLowerCase())) {
    return { reason: "assinatura nao confere", valid: false };
  }

  return { reason: "", valid: true };
}
