"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./payment-experience.module.css";
import { formatCurrency } from "@/src/checkout/whatsapp.js";
import { MAX_INSTALLMENTS } from "@/src/payments/payment-config.js";
import { formatCardExpiryInput, parseCardExpiry } from "@/src/payments/card-expiry.js";

const SDK_URL = "https://sdk.mercadopago.com/js/v2";
// Script separado do SDK. Ele coleta caracteristicas do navegador, manda para
// `api.mercadopago.com/web_device` e devolve um identificador em
// `window.MP_DEVICE_SESSION_ID`. E o campo de maior peso na analise de cartao:
// sem ele o provedor nao distingue o comprador de sempre de um cartao roubado.
const DEVICE_URL = "https://www.mercadopago.com/v2/security.js";
const POLL_MS = 5000;

const TABS = [
  { id: "pix", label: "Pix" },
  { id: "cartao", label: "Cartao" },
  { id: "boleto", label: "Boleto" }
];

const STATUS_PAGO = "pagamento_confirmado";
const STATUS_FINAIS = new Set([STATUS_PAGO, "recusado", "cancelado", "reembolsado", "expirado"]);

// Mola curta para a troca de aba e a revelacao do QR. A confirmacao usa a mola
// mais forte da tela: e o unico momento em que vale chamar atencao.
const MOLA = { bounce: 0.25, duration: 0.35, type: "spring" };
const MOLA_FORTE = { bounce: 0.5, duration: 0.6, type: "spring" };

/**
 * Carrega o SDK do provedor SO quando a aba de cartao esta aberta.
 *
 * Pix e boleto sao resolvidos inteiros no servidor e nao precisam de SDK.
 * Carregando sob demanda, o peso e o rastreamento que vem junto existem apenas
 * para quem realmente vai usar cartao.
 */
function useProviderSdk(publicKey, ativo) {
  const [sdk, setSdk] = useState(null);

  useEffect(() => {
    if (!ativo || !publicKey || typeof window === "undefined") {
      return undefined;
    }

    let cancelado = false;

    function instanciar() {
      if (cancelado || !window.MercadoPago) {
        return;
      }

      setSdk(new window.MercadoPago(publicKey, { locale: "pt-BR" }));
    }

    if (window.MercadoPago) {
      instanciar();
      return undefined;
    }

    const existente = document.querySelector(`script[src="${SDK_URL}"]`);
    const script = existente ?? document.createElement("script");

    script.addEventListener("load", instanciar);

    if (!existente) {
      script.src = SDK_URL;
      script.async = true;
      document.head.append(script);
    }

    return () => {
      cancelado = true;
      script.removeEventListener("load", instanciar);
    };
  }, [ativo, publicKey]);

  return sdk;
}

/**
 * Impressao digital do dispositivo, so na aba de cartao.
 *
 * Carregado junto com o SDK e pelo mesmo motivo: Pix e boleto nao precisam, e
 * quem paga por esses meios nao deve ser rastreado a toa.
 *
 * O identificador chega de forma ASSINCRONA — o script consulta o provedor
 * antes de publicar `MP_DEVICE_SESSION_ID`. Por isso o valor e lido por
 * intervalo curto em vez de uma vez so: ler cedo demais devolveria `undefined`
 * e a cobranca sairia sem o campo justamente no caso comum.
 */
function useDeviceSessionId(ativo) {
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    if (!ativo || typeof window === "undefined") {
      return undefined;
    }

    if (!document.querySelector(`script[src="${DEVICE_URL}"]`)) {
      const script = document.createElement("script");

      script.src = DEVICE_URL;
      script.setAttribute("view", "checkout");
      script.async = true;
      document.head.append(script);
    }

    const id = window.setInterval(() => {
      if (window.MP_DEVICE_SESSION_ID) {
        setDeviceId(window.MP_DEVICE_SESSION_ID);
        window.clearInterval(id);
      }
    }, 400);

    // Desiste depois de 8s. Falta de identificador reduz a aprovacao, mas
    // esperar por ele travaria o pagamento — o que seria pior.
    const desistir = window.setTimeout(() => window.clearInterval(id), 8000);

    return () => {
      window.clearInterval(id);
      window.clearTimeout(desistir);
    };
  }, [ativo]);

  return deviceId;
}

function useCountdown(expiresAt) {
  const [restante, setRestante] = useState(null);

  useEffect(() => {
    if (!expiresAt) {
      setRestante(null);
      return undefined;
    }

    function tick() {
      setRestante(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }

    tick();
    const id = window.setInterval(tick, 1000);

    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (restante === null) {
    return null;
  }

  // O Pix do provedor vale 24h. Sem a hora, "1439:56" nao e legivel como
  // "falta quase um dia" — e o formato so aparece quando existe hora.
  const totalSegundos = Math.floor(restante / 1000);
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = String(Math.floor((totalSegundos % 3600) / 60)).padStart(2, "0");
  const segundos = String(totalSegundos % 60).padStart(2, "0");
  const texto = horas > 0 ? `${horas}h ${minutos}min` : `${minutos}:${segundos}`;

  return { esgotado: restante === 0, texto, urgente: restante < 600000 };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Nao foi possivel concluir o pagamento agora.");
  }

  return data;
}

function CopyButton({ aoFalhar, onErro, rotulo, texto }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2400);
    } catch {
      aoFalhar?.();
      onErro("O navegador bloqueou a copia. O codigo esta inteiro abaixo — selecione e copie.");
    }
  }

  return (
    <button
      aria-label={`Copiar ${rotulo}`}
      className={styles.secondary}
      onClick={copiar}
      type="button"
    >
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

/**
 * Codigo com botao de copiar.
 *
 * Enquanto a copia funciona, o texto fica truncado numa linha — ninguem digita
 * um copia-e-cola de 162 caracteres, so copia. Quando ela FALHA, truncar vira
 * armadilha: a mensagem manda selecionar um codigo que nao esta visivel. Aí o
 * codigo se abre por inteiro.
 */
function CopyRow({ onErro, rotulo, texto }) {
  const [copiaFalhou, setCopiaFalhou] = useState(false);

  return (
    <div className={`${styles.copyBox} ${copiaFalhou ? styles.copyBoxAberta : ""}`}>
      <code>{texto}</code>
      <CopyButton
        aoFalhar={() => setCopiaFalhou(true)}
        onErro={onErro}
        rotulo={rotulo}
        texto={texto}
      />
    </div>
  );
}

function Feedback({ erro, texto }) {
  if (!texto) {
    return null;
  }

  return (
    <p
      className={`${styles.feedback} ${erro ? styles.feedbackError : styles.feedbackInfo}`}
      role={erro ? "alert" : "status"}
    >
      {texto}
    </p>
  );
}

function PixPanel({ amountCents, onCobrancaGerada, onErro, orderId }) {
  const [cobranca, setCobranca] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const contagem = useCountdown(cobranca?.expiresAt);

  async function gerar() {
    setCarregando(true);
    onErro("");

    try {
      setCobranca(await postJson("/api/pagamento/pix", { orderId }));
      // Codigo novo e pagamento em aberto de novo. Se o status anterior era
      // final (expirado, cancelado), a tela tinha parado de consultar: o
      // cliente pagaria este codigo e nunca veria a confirmacao.
      onCobrancaGerada?.();
    } catch (error) {
      onErro(error.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className={styles.panel}>
      <h2>Pix</h2>

      {cobranca ? (
        <div className={styles.qr}>
          {cobranca.qrCodeBase64 ? (
            <img
              alt="QR Code do Pix"
              src={`data:image/png;base64,${cobranca.qrCodeBase64}`}
              width={240}
            />
          ) : null}

          <CopyRow onErro={onErro} rotulo="o codigo Pix" texto={cobranca.qrCode} />

          {contagem ? (
            <p className={`${styles.countdown} ${contagem.urgente ? styles.countdownUrgent : ""}`}>
              {contagem.esgotado
                ? "Este codigo expirou. Gere outro para pagar."
                : `Expira em ${contagem.texto}`}
            </p>
          ) : null}

          {/* A frase acima pede um codigo novo; sem este botao o unico caminho
              era recarregar a pagina, e nada na tela dizia isso. */}
          {contagem?.esgotado ? (
            <button className={styles.action} disabled={carregando} onClick={gerar} type="button">
              {carregando ? "Gerando codigo…" : "Gerar outro codigo Pix"}
            </button>
          ) : null}

          <p className={styles.hint}>
            A confirmacao chega sozinha assim que o banco avisar. Pode deixar esta pagina aberta.
          </p>
        </div>
      ) : (
        <>
          <p className={styles.hint}>
            Gere o codigo e pague pelo app do seu banco. O valor de {formatCurrency(amountCents)} ja
            esta calculado.
          </p>
          <button className={styles.action} disabled={carregando} onClick={gerar} type="button">
            {carregando ? "Gerando codigo…" : "Gerar codigo Pix"}
          </button>
        </>
      )}
    </div>
  );
}

// Rótulos dos trilhos que um cartão pode usar. `payment_type_id` é o vocabulário
// do provedor; aqui ele vira o que o cliente entende.
const ROTULO_DO_TIPO = {
  credit_card: "Crédito",
  debit_card: "Débito",
  prepaid_card: "Pré-pago"
};

/**
 * Quais trilhos ESTE cartão aceita, segundo o provedor.
 *
 * A lista vem do BIN, não de uma escolha nossa: é o número do cartão que decide
 * se ele é de débito, de crédito ou dos dois. Oferecer a opção sem perguntar ao
 * provedor criaria uma escolha que seria recusada na cobrança.
 *
 * Com um tipo só a tela não mostra seletor: não há escolha a fazer. É o caso de
 * hoje. Conferido em 2026-09-10 com `/v1/payment_methods`: a conta da loja TEM
 * débito ativo, mas só `debelo` (Cartão de Débito Virtual Caixa, bandeira Elo).
 * Visa, Master e Elo de outros bancos chegam como crédito ou pré-pago.
 *
 * Não é opção desligada em painel nenhum: a conta de sandbox lista `debvisa`,
 * `debmaster` e `maestro`, então essa liberação é do Mercado Pago, conta por
 * conta. No dia em que liberarem, o provedor passa a devolver os dois tipos para
 * o mesmo BIN e o seletor aparece aqui sozinho.
 */
function useCardPaymentTypes({ cardNumber, sdk }) {
  const [tipos, setTipos] = useState([]);
  const bin = cardNumber.replace(/\D/g, "").slice(0, 6);

  useEffect(() => {
    if (!sdk || bin.length < 6) {
      setTipos([]);
      return undefined;
    }

    let ativo = true;

    (async () => {
      try {
        const metodos = await sdk.getPaymentMethods({ bin });
        const vistos = new Map();

        for (const metodo of metodos?.results ?? []) {
          const tipo = metodo?.payment_type_id;

          if (tipo && ROTULO_DO_TIPO[tipo] && !vistos.has(tipo)) {
            vistos.set(tipo, { id: tipo, label: ROTULO_DO_TIPO[tipo] });
          }
        }

        if (ativo) {
          setTipos([...vistos.values()]);
        }
      } catch {
        // Sem resposta do provedor, a tela segue sem seletor e a cobrança usa o
        // primeiro método que ele devolver. Perder a escolha é um incômodo;
        // travar o pagamento por causa dela seria o estrago.
        if (ativo) {
          setTipos([]);
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [bin, sdk]);

  return tipos;
}

/**
 * Parcelas e quanto cada uma custa, direto do provedor.
 *
 * O valor com juros NAO e calculado aqui: quem define a taxa e o emissor do
 * cartao, e ela muda por bandeira e por parcela. Inventar uma formula mostraria
 * um numero que nao bate com a fatura. O SDK devolve o que sera cobrado de
 * verdade — o mesmo dado que o provedor usa para cobrar.
 *
 * Depende do bin (6 primeiros digitos), entao so consulta quando o cliente
 * digitou o suficiente do cartao.
 */
function useInstallments({ amountCents, cardNumber, sdk }) {
  const [opcoes, setOpcoes] = useState(null);
  const bin = cardNumber.replace(/\D/g, "").slice(0, 6);

  useEffect(() => {
    if (!sdk || bin.length < 6) {
      setOpcoes(null);
      return undefined;
    }

    let cancelado = false;

    (async () => {
      try {
        const resposta = await sdk.getInstallments({
          amount: String(amountCents / 100),
          bin,
          locale: "pt-BR"
        });
        const custos = resposta?.[0]?.payer_costs ?? [];

        if (!cancelado) {
          setOpcoes(
            // O provedor oferece mais parcelas do que a loja aceita. Mostrar o
            // que a rota recusaria com 400 seria oferecer um erro.
            custos
              .filter((custo) => custo.installments <= MAX_INSTALLMENTS)
              .map((custo) => ({
                parcelas: custo.installments,
                temJuros: Number(custo.installment_rate) > 0,
                totalCents: Math.round(Number(custo.total_amount) * 100),
                valorParcelaCents: Math.round(Number(custo.installment_amount) * 100)
              }))
          );
        }
      } catch {
        // Sem simulacao o cliente ainda consegue pagar: o seletor cai para a
        // lista simples e o provedor cobra o valor certo de qualquer jeito.
        if (!cancelado) setOpcoes(null);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [amountCents, bin, sdk]);

  return opcoes;
}

function CardPanel({ amountCents, onCobrancaGerada, onErro, onMensagem, orderId, sdk }) {
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    // Vencimento num campo so ("09/29"), como vem impresso no cartao. Separar
    // em mes e ano obrigava o cliente a traduzir o que estava lendo.
    cardExpiry: "",
    cardNumber: "",
    cardholderName: "",
    identificationNumber: "",
    installments: "1",
    // Debito ou credito. So aparece quando o proprio provedor diz que o cartao
    // aceita os dois — ver `useCardPaymentTypes`.
    paymentTypeId: "",
    securityCode: ""
  });

  const deviceId = useDeviceSessionId(true);
  const tipos = useCardPaymentTypes({ cardNumber: form.cardNumber, sdk });
  const tipoEscolhido = tipos.find((tipo) => tipo.id === form.paymentTypeId) ?? tipos[0] ?? null;
  // Debito nao parcela: o valor sai da conta de uma vez. Mostrar um seletor de
  // parcelas aqui seria oferecer algo que o provedor recusa.
  const aceitaParcelar = tipoEscolhido?.id !== "debit_card";

  const parcelas = useInstallments({
    amountCents,
    cardNumber: aceitaParcelar ? form.cardNumber : "",
    sdk
  });
  const escolhida = aceitaParcelar
    ? parcelas?.find((opcao) => String(opcao.parcelas) === form.installments)
    : null;

  function campo(nome) {
    return {
      onChange: (event) => setForm((atual) => ({ ...atual, [nome]: event.target.value })),
      value: form[nome]
    };
  }

  async function pagar(event) {
    event.preventDefault();

    if (!sdk) {
      onErro("O componente de cartao ainda esta carregando. Tente em instantes.");
      return;
    }

    setEnviando(true);
    onErro("");
    onMensagem("");

    try {
      const numero = form.cardNumber.replace(/\D/g, "");
      const documento = form.identificationNumber.replace(/\D/g, "");

      // O bin (6 primeiros digitos) diz a bandeira e o emissor. Sem isso o
      // provedor nao sabe para onde mandar a autorizacao.
      // Recusa aqui, antes de tokenizar: mensagem legivel em vez do erro
      // generico que o provedor devolveria.
      const vencimento = parseCardExpiry(form.cardExpiry);

      if (!vencimento) {
        throw new Error("Validade invalida. Use o formato MM/AA, como esta no cartao.");
      }

      const metodos = await sdk.getPaymentMethods({ bin: numero.slice(0, 6) });
      // O tipo escolhido decide QUAL metodo usar: o mesmo cartao pode aparecer
      // como credito e como debito, e o provedor precisa saber por qual trilho
      // mandar a autorizacao.
      const metodo =
        metodos?.results?.find((candidato) => candidato.payment_type_id === tipoEscolhido?.id) ??
        metodos?.results?.[0];

      if (!metodo) {
        throw new Error("Cartao nao reconhecido. Confira o numero.");
      }

      // O numero e o CVV param aqui: o SDK troca por um token de uso unico, e
      // so o token vai para o nosso servidor.
      const token = await sdk.createCardToken({
        cardExpirationMonth: vencimento.month,
        cardExpirationYear: vencimento.year,
        cardNumber: numero,
        cardholderName: form.cardholderName,
        identificationNumber: documento,
        identificationType: documento.length === 14 ? "CNPJ" : "CPF",
        securityCode: form.securityCode
      });

      const resposta = await postJson("/api/pagamento/cartao", {
        cardToken: token.id,
        // Unico campo do corpo que descreve o AMBIENTE, nao a identidade do
        // pagador: ele so existe no navegador. Vazio quando o script ainda nao
        // respondeu — a cobranca sai mesmo assim, com aprovacao mais baixa.
        deviceId,
        // Debito e sempre a vista: mandar parcelas aqui seria pedir ao provedor
        // algo que ele recusa.
        installments: metodo.payment_type_id === "debit_card" ? 1 : Number(form.installments),
        issuerId: metodo.issuer?.id,
        orderId,
        paymentMethodId: metodo.id
      });

      // Um cartao recusado antes deixa o status final e a consulta parada; esta
      // tentativa nova precisa voltar a ser consultada.
      onCobrancaGerada?.();
      onMensagem(resposta.mensagem ?? "Pagamento em processamento.");
    } catch (error) {
      onErro(error.message || "Nao foi possivel processar o cartao.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className={styles.panel} data-navigation="none" onSubmit={pagar}>
      <h2>Cartao</h2>
      <p className={styles.hint}>
        O numero e o codigo de seguranca sao trocados por um token no seu proprio navegador. Eles
        nao passam pelo nosso servidor.
      </p>

      <label className={styles.field}>
        <span>Numero do cartao</span>
        <input autoComplete="cc-number" inputMode="numeric" required {...campo("cardNumber")} />
      </label>

      <label className={styles.field}>
        <span>Nome impresso no cartao</span>
        <input autoComplete="cc-name" required {...campo("cardholderName")} />
      </label>

      {/* So aparece quando o provedor diz que ESTE cartao aceita os dois
          trilhos. Oferecer a escolha sempre criaria uma opcao que seria
          recusada — hoje, por exemplo, a conta da loja nem tem debito
          habilitado, entao a lista vem com um tipo so e o seletor nao aparece. */}
      {tipos.length > 1 ? (
        <div className={styles.fieldRow} role="radiogroup" aria-label="Tipo do cartao">
          {tipos.map((tipo) => (
            <label className={styles.field} key={tipo.id}>
              <input
                checked={tipoEscolhido?.id === tipo.id}
                name="paymentTypeId"
                onChange={() => setForm((atual) => ({ ...atual, paymentTypeId: tipo.id }))}
                type="radio"
                value={tipo.id}
              />
              <span>{tipo.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span>Validade</span>
          <input
            autoComplete="cc-exp"
            inputMode="numeric"
            maxLength={7}
            onChange={(event) =>
              setForm((atual) => ({
                ...atual,
                cardExpiry: formatCardExpiryInput(event.target.value)
              }))
            }
            placeholder="MM/AA"
            required
            value={form.cardExpiry}
          />
          <small>Como esta impresso no cartao.</small>
        </label>
        {/* Validade e codigo de seguranca lado a lado: e como os dois aparecem
            no cartao, e o cliente le os dois no mesmo lugar. */}
        <label className={styles.field}>
          <span>Codigo de seguranca</span>
          <input
            autoComplete="cc-csc"
            inputMode="numeric"
            maxLength={4}
            required
            {...campo("securityCode")}
          />
        </label>
      </div>

      <label className={styles.field}>
        <span>CPF ou CNPJ</span>
        <input inputMode="numeric" required {...campo("identificationNumber")} />
      </label>

      {/* Débito sai da conta de uma vez. Mostrar parcelas aqui seria oferecer
          algo que o provedor recusa na hora da cobrança. */}
      {aceitaParcelar ? (
        <label className={styles.field}>
          <span>Parcelas</span>
          <select {...campo("installments")}>
            {parcelas
              ? parcelas.map((opcao) => (
                  <option key={opcao.parcelas} value={String(opcao.parcelas)}>
                    {opcao.parcelas}x de {formatCurrency(opcao.valorParcelaCents)}
                    {opcao.temJuros ? ` — total ${formatCurrency(opcao.totalCents)}` : " sem juros"}
                  </option>
                ))
              : Array.from({ length: MAX_INSTALLMENTS }, (_, indice) => indice + 1).map(
                  (parcela) => (
                    <option key={parcela} value={String(parcela)}>
                      {parcela}x
                    </option>
                  )
                )}
          </select>
        </label>
      ) : (
        <p className={styles.hint}>
          No débito o valor de {formatCurrency(amountCents)} sai de uma vez, sem parcelamento.
        </p>
      )}

      {/* O valor com juros so aparece depois do bin: antes disso a loja nao tem
          como saber a taxa do emissor, e um numero chutado aqui viraria
          reclamacao quando a fatura chegasse diferente. */}
      {escolhida ? (
        <p className={escolhida.temJuros ? styles.totalDestacado : styles.hint}>
          {escolhida.temJuros ? (
            <>
              Com {escolhida.parcelas}x, o total cobrado sobe para{" "}
              <strong>{formatCurrency(escolhida.totalCents)}</strong> — juros do cartao, definidos
              pelo emissor. O pedido continua valendo {formatCurrency(amountCents)}.
            </>
          ) : (
            <>
              {escolhida.parcelas}x sem juros. Total cobrado:{" "}
              <strong>{formatCurrency(escolhida.totalCents)}</strong>.
            </>
          )}
        </p>
      ) : null}

      <button className={styles.action} disabled={enviando} type="submit">
        {enviando ? "Processando…" : "Pagar com cartao"}
      </button>
    </form>
  );
}

function BoletoPanel({ onCobrancaGerada, onErro, orderId }) {
  const [boleto, setBoleto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", payerEmail: "", taxId: "" });

  function campo(nome) {
    return {
      onChange: (event) => setForm((atual) => ({ ...atual, [nome]: event.target.value })),
      value: form[nome]
    };
  }

  async function gerar(event) {
    event.preventDefault();
    setEnviando(true);
    onErro("");

    try {
      setBoleto(await postJson("/api/pagamento/boleto", { ...form, orderId }));
      onCobrancaGerada?.();
    } catch (error) {
      onErro(error.message);
    } finally {
      setEnviando(false);
    }
  }

  if (boleto) {
    const vencimento = boleto.expiresAt
      ? new Date(boleto.expiresAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : null;

    return (
      <div className={styles.panel}>
        <h2>Boleto gerado</h2>
        <p className={styles.hint}>
          {vencimento ? `Vence em ${vencimento}. ` : ""}A compensacao leva ate 3 dias uteis. O
          pedido segue assim que o banco confirmar.
        </p>
        {/* Aqui o codigo aparece inteiro e quebrando linha: a linha digitavel
            do boleto e digitada no app do banco quando a copia falha. */}
        <p className={styles.barcode}>{boleto.barcode}</p>
        <CopyButton onErro={onErro} rotulo="a linha digitavel" texto={boleto.barcode} />
        {boleto.ticketUrl ? (
          <a
            className={styles.link}
            href={boleto.ticketUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            Abrir boleto para imprimir
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form className={styles.panel} data-navigation="none" onSubmit={gerar}>
      <h2>Boleto</h2>
      <p className={styles.hint}>O emissor exige nome completo e CPF ou CNPJ do pagador.</p>

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span>Nome</span>
          <input autoComplete="given-name" required {...campo("firstName")} />
        </label>
        <label className={styles.field}>
          <span>Sobrenome</span>
          <input autoComplete="family-name" {...campo("lastName")} />
        </label>
      </div>

      <label className={styles.field}>
        <span>E-mail</span>
        <input autoComplete="email" required type="email" {...campo("payerEmail")} />
      </label>

      <label className={styles.field}>
        <span>CPF ou CNPJ</span>
        <input inputMode="numeric" required {...campo("taxId")} />
      </label>

      <button className={styles.action} disabled={enviando} type="submit">
        {enviando ? "Gerando boleto…" : "Gerar boleto"}
      </button>
    </form>
  );
}

export function PaymentExperience({ amountCents, initialStatus, orderId, orderNumber, publicKey }) {
  const [aba, setAba] = useState("pix");
  const [status, setStatus] = useState(initialStatus);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const sdk = useProviderSdk(publicKey, aba === "cartao");
  const reduzido = useReducedMotion();
  const statusRef = useRef(status);

  statusRef.current = status;

  const transicao = useMemo(() => (reduzido ? { duration: 0 } : MOLA), [reduzido]);
  const transicaoForte = useMemo(() => (reduzido ? { duration: 0 } : MOLA_FORTE), [reduzido]);

  const pago = status === STATUS_PAGO;

  // O Pix confirma por webhook, entao a tela pergunta. Para de perguntar assim
  // que o status vira final — nao existe motivo para bater na rota para sempre.
  useEffect(() => {
    if (STATUS_FINAIS.has(status)) {
      return undefined;
    }

    async function consultar() {
      if (document.visibilityState === "hidden") {
        return;
      }

      try {
        const response = await fetch(
          `/api/pagamento/status?orderId=${encodeURIComponent(orderId)}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          return;
        }

        const data = await response.json();

        if (data.status && data.status !== statusRef.current) {
          setStatus(data.status);
        }
      } catch {
        // Falha de rede na consulta nao muda nada: a proxima tentativa resolve.
      }
    }

    const id = window.setInterval(consultar, POLL_MS);

    return () => window.clearInterval(id);
  }, [orderId, status]);

  const limparErro = useCallback((texto) => setErro(texto), []);

  // Cobranca nova feita pela tela e pagamento em aberto de novo. Se o status
  // estava final (expirado, recusado, cancelado), a consulta tinha parado — e a
  // confirmacao desta cobranca nunca apareceria. Pago nao volta atras.
  const reabrirConsulta = useCallback(() => {
    setStatus((atual) => (atual === STATUS_PAGO ? atual : "aguardando_pagamento"));
  }, []);

  if (pago) {
    return (
      <section className={styles.shell}>
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className={styles.success}
          initial={{ opacity: 0, scale: 0.9 }}
          transition={transicaoForte}
        >
          <motion.span
            animate={{ rotate: 0, scale: 1 }}
            className={styles.successMark}
            initial={{ rotate: reduzido ? 0 : -25, scale: 0 }}
            transition={transicaoForte}
          >
            ✓
          </motion.span>
          <h2>Pagamento confirmado</h2>
          <p>
            O pedido {orderNumber || ""} ja esta na fila de separacao. Voce recebe as novidades por
            e-mail.
          </p>
        </motion.div>
      </section>
    );
  }

  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <h1>Pagamento do pedido {orderNumber || ""}</h1>
        <p>Escolha como prefere pagar. O valor ja inclui frete e desconto.</p>
      </header>

      <div className={styles.amount}>
        <span>Total a pagar</span>
        <strong>{formatCurrency(amountCents)}</strong>
      </div>

      <div aria-label="Formas de pagamento" className={styles.tabs} role="tablist">
        {TABS.map((item) => (
          <button
            aria-selected={aba === item.id}
            className={styles.tab}
            key={item.id}
            onClick={() => setAba(item.id)}
            role="tab"
            type="button"
          >
            {aba === item.id ? (
              <motion.span
                className={styles.tabHighlight}
                layoutId="aba-ativa"
                transition={transicao}
              />
            ) : null}
            <span style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
          </button>
        ))}
      </div>

      <Feedback erro texto={erro} />
      <Feedback texto={mensagem} />

      {/* Sem AnimatePresence de proposito.
          `mode="wait"` so monta o painel novo depois que a animacao de saida
          TERMINA — e ela nao termina quando o navegador para o
          requestAnimationFrame, o que acontece em aba de segundo plano. O
          resultado e a pior falha possivel aqui: a aba marcada como "Boleto" e
          o conteudo travado no Pix, indefinidamente.
          Reproduzido em cobranca real no staging.

          Trocando a montagem por remontagem por `key`, o painel certo aparece
          na hora e a animacao vira enfeite: se ela nao rodar, a tela continua
          correta. Correcao nunca depende de animacao terminar. */}
      <div>
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: reduzido ? 0 : 8 }}
          key={aba}
          transition={transicao}
        >
          {aba === "pix" ? (
            <PixPanel
              amountCents={amountCents}
              onCobrancaGerada={reabrirConsulta}
              onErro={limparErro}
              orderId={orderId}
            />
          ) : null}
          {aba === "cartao" ? (
            <CardPanel
              amountCents={amountCents}
              onCobrancaGerada={reabrirConsulta}
              onErro={limparErro}
              onMensagem={setMensagem}
              orderId={orderId}
              sdk={sdk}
            />
          ) : null}
          {aba === "boleto" ? (
            <BoletoPanel
              onCobrancaGerada={reabrirConsulta}
              onErro={limparErro}
              orderId={orderId}
            />
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}
