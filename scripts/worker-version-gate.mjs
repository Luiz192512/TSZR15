// Portao do envio de segredos para um Worker.
//
// A Cloudflare so aceita `wrangler secret put` quando a versao MAIS NOVA do
// Worker e a que esta publicada. Neste projeto isso quebra por construcao: todo
// push de branch roda `opennextjs-cloudflare upload` no Worker de producao e
// deixa uma versao nova sem publicar (docs/ROLLOUT-PAGAMENTO.md, passo 5).
//
// Sem esta conferencia o configurador descobria o bloqueio na primeira
// variavel, com a mensagem crua do wrangler. E a saida que parece obvia,
// `wrangler versions secret put`, parte da versao mais nova: publica-la levaria
// para a loja no ar um codigo de branch que ninguem revisou.
//
// Funcao pura, sem wrangler: quem chama entrega a saida de
// `wrangler versions list --json` e `wrangler deployments status --json`.

function criadaEm(versao) {
  return Date.parse(versao?.metadata?.created_on ?? "");
}

function resumir(versao) {
  return { criadaEm: versao?.metadata?.created_on ?? "", id: versao?.id ?? "" };
}

export function avaliarPortaoDeVersao({ deployment, versoes }) {
  const lista = Array.isArray(versoes) ? versoes : [];
  const idsServindo = new Set(
    (deployment?.versions ?? [])
      .filter((item) => Number(item?.percentage) > 0)
      .map((item) => item.version_id)
  );

  // Wrangler sem login, sem rede ou com saida inesperada. Nao da para afirmar
  // que o envio vai passar, entao ele nao roda.
  if (!lista.length || !idsServindo.size) {
    return { liberado: false, motivo: "sem_dados", naoPublicadas: [], servindo: [] };
  }

  const ordenadas = [...lista].sort((a, b) => criadaEm(a) - criadaEm(b));
  const servindo = ordenadas.filter((versao) => idsServindo.has(versao.id));

  // A lista do wrangler e paginada: a versao no ar pode ter ficado de fora dela
  // porque houve envios demais depois. Tambem nao libera.
  if (!servindo.length) {
    return {
      liberado: false,
      motivo: "versao_servindo_fora_da_lista",
      naoPublicadas: [],
      servindo: []
    };
  }

  const ultimaServindo = Math.max(...servindo.map(criadaEm));
  const naoPublicadas = ordenadas.filter(
    (versao) => !idsServindo.has(versao.id) && criadaEm(versao) > ultimaServindo
  );

  return {
    liberado: naoPublicadas.length === 0,
    motivo: naoPublicadas.length ? "versao_nao_publicada_na_frente" : "ok",
    naoPublicadas: naoPublicadas.map(resumir),
    servindo: servindo.map(resumir)
  };
}
