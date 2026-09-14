// Escolhe a variante da foto de acordo com a largura que o navegador pede.
//
// As tres variantes JA EXISTEM no bucket desde
// `scripts/optimize-product-images.mjs`: thumb (200 px, ~7 KB), card (640 px,
// ~58 KB) e detail (1200 px, ~163 KB). O que faltava era o `srcset`: com
// `images.unoptimized`, o next/image emitia um `src` unico, entao o celular
// baixava a mesma variante que o desktop — na pagina de produto, 163 KB onde
// 58 KB bastavam.
//
// Este carregador nao redimensiona nada em tempo de requisicao: ele so aponta
// para o arquivo certo entre os que ja foram gerados. Por isso nao depende do
// otimizador do Next, que nao roda no worker do Cloudflare.

import { getProductImageVariants, isOptimizedProductImageUrl } from "./image-variants.js";

export default function productImageLoader({ src, width }) {
  if (!isOptimizedProductImageUrl(src)) {
    // Asset de marca ou foto ainda nao processada: nao ha variante para
    // escolher, entao o endereco original e a unica resposta honesta.
    return src;
  }

  const variants = getProductImageVariants(src);

  if (width <= 200) {
    return variants.thumb;
  }

  if (width <= 640) {
    return variants.card;
  }

  return variants.detail;
}
