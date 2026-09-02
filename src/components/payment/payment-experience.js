"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "./payment-experience.module.css";
import { formatCurrency } from "@/src/checkout/whatsapp.js";

const SDK_URL = "https://sdk.mercadopago.com/js/v2";
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
 * O SDK faz impressao digital do dispositivo assim que carrega: ele tenta falar
 * com mercadolibre.com e ate abrir um iframe. Nossa CSP bloqueia tudo isso, e o
 * bloqueio vira ruido no console de quem so queria pagar por Pix. Carregando sob
 * demanda, o custo existe apenas para quem realmente vai usar cartao.
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

function CopyButton({ onErro, rotulo, texto }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2400);
    } catch {
      onErro("O navegador bloqueou a copia. Selecione o codigo e copie manualmente.");
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

// O codigo Pix e longo demais para caber: fica truncado com o botao ao lado,
// porque ninguem digita um copia-e-cola — so copia.
function CopyRow({ onErro, rotulo, texto }) {
  return (
    <div className={styles.copyBox}>
      <code>{texto}</code>
      <CopyButton onErro={onErro} rotulo={rotulo} texto={texto} />
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

function PixPanel({ amountCents, onErro, orderId }) {
  const [cobranca, setCobranca] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const contagem = useCountdown(cobranca?.expiresAt);

  async function gerar() {
    setCarregando(true);
    onErro("");

    try {
      setCobranca(await postJson("/api/pagamento/pix", { orderId }));
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

function CardPanel({ onErro, onMensagem, orderId, sdk }) {
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    cardExpirationMonth: "",
    cardExpirationYear: "",
    cardNumber: "",
    cardholderName: "",
    identificationNumber: "",
    installments: "1",
    securityCode: ""
  });

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
      const metodos = await sdk.getPaymentMethods({ bin: numero.slice(0, 6) });
      const metodo = metodos?.results?.[0];

      if (!metodo) {
        throw new Error("Cartao nao reconhecido. Confira o numero.");
      }

      // O numero e o CVV param aqui: o SDK troca por um token de uso unico, e
      // so o token vai para o nosso servidor.
      const token = await sdk.createCardToken({
        cardExpirationMonth: form.cardExpirationMonth,
        cardExpirationYear: form.cardExpirationYear,
        cardNumber: numero,
        cardholderName: form.cardholderName,
        identificationNumber: documento,
        identificationType: documento.length === 14 ? "CNPJ" : "CPF",
        securityCode: form.securityCode
      });

      const resposta = await postJson("/api/pagamento/cartao", {
        cardToken: token.id,
        installments: Number(form.installments),
        issuerId: metodo.issuer?.id,
        orderId,
        paymentMethodId: metodo.id
      });

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

      <div className={styles.fieldRow}>
        <label className={styles.field}>
          <span>Mes</span>
          <input
            autoComplete="cc-exp-month"
            inputMode="numeric"
            maxLength={2}
            placeholder="MM"
            required
            {...campo("cardExpirationMonth")}
          />
        </label>
        <label className={styles.field}>
          <span>Ano</span>
          <input
            autoComplete="cc-exp-year"
            inputMode="numeric"
            maxLength={4}
            placeholder="AAAA"
            required
            {...campo("cardExpirationYear")}
          />
        </label>
      </div>

      <div className={styles.fieldRow}>
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
        <label className={styles.field}>
          <span>CPF ou CNPJ</span>
          <input inputMode="numeric" required {...campo("identificationNumber")} />
        </label>
      </div>

      <label className={styles.field}>
        <span>Parcelas</span>
        <select {...campo("installments")}>
          {Array.from({ length: 12 }, (_, indice) => indice + 1).map((parcela) => (
            <option key={parcela} value={String(parcela)}>
              {parcela}x
            </option>
          ))}
        </select>
      </label>

      <button className={styles.action} disabled={enviando} type="submit">
        {enviando ? "Processando…" : "Pagar com cartao"}
      </button>
    </form>
  );
}

function BoletoPanel({ onErro, orderId }) {
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

      {/* mode="wait" para o painel novo nao entrar por cima do que esta saindo:
          com formularios de tamanhos diferentes, sobrepor faz a pagina pular. */}
      <AnimatePresence initial={false} mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduzido ? 0 : -8 }}
          initial={{ opacity: 0, y: reduzido ? 0 : 8 }}
          key={aba}
          transition={transicao}
        >
          {aba === "pix" ? (
            <PixPanel amountCents={amountCents} onErro={limparErro} orderId={orderId} />
          ) : null}
          {aba === "cartao" ? (
            <CardPanel onErro={limparErro} onMensagem={setMensagem} orderId={orderId} sdk={sdk} />
          ) : null}
          {aba === "boleto" ? <BoletoPanel onErro={limparErro} orderId={orderId} /> : null}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
