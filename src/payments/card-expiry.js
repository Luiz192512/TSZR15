// Vencimento do cartao num campo so.
//
// Eram dois campos, "Mes" e "Ano". No cartao o vencimento e impresso como um
// dado unico ("09/29"), e dividir obriga o cliente a traduzir o que ele esta
// lendo — no celular, com dois campos pequenos lado a lado, e onde mais se erra.
//
// O parsing vive aqui, fora do componente, para ser testavel sem navegador.

const ANO_BASE = 2000;

/**
 * Formata enquanto a pessoa digita: "0929" vira "09/29".
 *
 * A barra e inserida sozinha depois do mes. Apagar tem que funcionar, entao a
 * barra NAO e recolocada quando o texto termina nela — sem isso, o backspace
 * ficaria preso no separador.
 */
export function formatCardExpiryInput(valor) {
  const digitos = String(valor ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);

  if (digitos.length <= 2) {
    return digitos;
  }

  return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
}

/**
 * Lê "MM/AA" ou "MM/AAAA" e devolve o que o provedor espera.
 *
 * Devolve `null` quando o valor não serve — o chamador transforma isso em
 * mensagem para o cliente, em vez de mandar um token que o provedor recusaria.
 */
export function parseCardExpiry(valor, hoje = new Date()) {
  const digitos = String(valor ?? "").replace(/\D/g, "");

  if (digitos.length !== 4 && digitos.length !== 6) {
    return null;
  }

  const mes = Number.parseInt(digitos.slice(0, 2), 10);

  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return null;
  }

  const anoDigitado = Number.parseInt(digitos.slice(2), 10);
  // "29" vira 2029. Dois digitos sempre significam este seculo: um cartao com
  // vencimento em 1929 nao existe, e um em 2129 tambem nao.
  const ano = digitos.length === 4 ? ANO_BASE + anoDigitado : anoDigitado;

  // Vencido. O provedor recusaria de qualquer jeito, mas a mensagem daqui e
  // legivel e chega antes de o cartao ser tokenizado.
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  if (ano < anoAtual || (ano === anoAtual && mes < mesAtual)) {
    return null;
  }

  // Cartao nao e emitido com validade tao longa; um ano assim e erro de
  // digitacao, e recusar aqui evita uma cobranca que iria falhar.
  if (ano > anoAtual + 30) {
    return null;
  }

  return {
    month: String(mes).padStart(2, "0"),
    year: String(ano)
  };
}
