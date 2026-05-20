"use client";

import Link from "next/link";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import { formatCategoryLabels } from "@/src/catalog/index.js";
import { ASSISTED_PURCHASE_CONSENT_TEXT } from "@/src/customer/customer-data.js";
import {
  buildWhatsAppOrderMessage,
  calculateCartTotals,
  formatCurrency,
  paymentMethods,
  shippingOptions
} from "@/src/checkout/whatsapp.js";

const storeName = process.env.NEXT_PUBLIC_STORE_NAME ?? "TSZR15";
const cartStorageKey = "tszr15-cart";

const emptyCustomer = {
  address: "",
  cep: "",
  email: "",
  name: "",
  notes: "",
  phone: "",
  taxId: "",
  whatsapp: ""
};

const familyLabels = {
  aero_front: "Aerodinamica",
  adesivo_detalhe: "Adesivo detalhe",
  adesivo_full: "Adesivo completo",
  cockpit: "Cockpit",
  controles: "Controles",
  escapamento: "Escapamento",
  iluminacao: "Iluminacao",
  manutencao: "Manutencao",
  protecao: "Protecao",
  retrovisor: "Retrovisor",
  slider: "Slider",
  tanque: "Tanque"
};

const familySummaries = {
  aero_front: "Peca de visual e aerodinamica para montar a frente ou acabamento da R15.",
  adesivo_detalhe: "Adesivo de detalhe para personalizar a R15 sem trocar a carenagem.",
  adesivo_full: "Kit visual completo para mudar a identidade da moto com acabamento combinado.",
  cockpit: "Item de cockpit para melhorar acabamento, uso diario ou protecao da area do piloto.",
  controles: "Comando ou acabamento de pilotagem para deixar a R15 mais ajustada ao uso.",
  escapamento: "Opcao de escape ou admissao para montar o conjunto conforme disponibilidade.",
  iluminacao: "Iluminacao e sinalizacao para atualizar o visual e a seguranca da moto.",
  manutencao: "Item de reposicao, limpeza ou cuidado para manter a R15 em dia.",
  protecao: "Protecao para reduzir dano em uso urbano, queda leve ou desgaste de peca.",
  retrovisor: "Retrovisor ou acabamento lateral para visual esportivo e uso no dia a dia.",
  slider: "Slider e suporte para proteger pontos expostos da Yamaha R15.",
  tanque: "Protecao ou acabamento para tanque com opcoes de cor e textura."
};

function normalizeSearch(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function getProductCode(product) {
  return product.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function getProductFamilyLabel(productFamily) {
  return familyLabels[productFamily] ?? String(productFamily ?? "").replaceAll("_", " ");
}

function getProductSummary(product) {
  return product.notes || familySummaries[product.productFamily] || "Produto curado para Yamaha R15.";
}

function getInitialCustomer(initialCustomer) {
  return {
    ...emptyCustomer,
    ...(initialCustomer ?? {})
  };
}

function getProductHref(product) {
  return `/produto/${product.slug}`;
}

function readStoredCart() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(cartStorageKey);
    const parsedItems = storedValue ? JSON.parse(storedValue) : [];

    return Array.isArray(parsedItems) ? parsedItems : [];
  } catch {
    return [];
  }
}

function writeStoredCart(items) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(cartStorageKey, JSON.stringify(items));
  window.dispatchEvent(new Event("tszr15-cart-changed"));
}

function getCartCount(items) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function sanitizeCartItems(items, products) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsBySlug = new Map(products.map((product) => [product.slug, product]));
  const itemsByKey = new Map();

  for (const item of items) {
    const product = productsById.get(item?.id) ?? productsBySlug.get(item?.slug);
    const quantity = Number(item?.quantity);

    if (!product || !Number.isInteger(quantity) || quantity < 1) {
      continue;
    }

    const variation = product.variations.includes(item?.variation)
      ? item.variation
      : product.variations[0];
    const cartKey = `${product.id}:${variation}`;
    const currentItem = itemsByKey.get(cartKey);

    itemsByKey.set(cartKey, {
      cartKey,
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      productFamily: product.productFamily,
      quantity: (currentItem?.quantity ?? 0) + quantity,
      slug: product.slug,
      variation
    });
  }

  return Array.from(itemsByKey.values());
}

function useCartCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function refreshCount() {
      setCount(getCartCount(readStoredCart()));
    }

    refreshCount();
    window.addEventListener("storage", refreshCount);
    window.addEventListener("tszr15-cart-changed", refreshCount);

    return () => {
      window.removeEventListener("storage", refreshCount);
      window.removeEventListener("tszr15-cart-changed", refreshCount);
    };
  }, []);

  return count;
}

function ProductVisual({ product, size = "card" }) {
  const categoryLabel = formatCategoryLabels(product.storefrontCategoryIds)[0] ?? "R15";
  const familyClass = `family-${product.productFamily}`;

  return (
    <div className={`product-image product-image-${size} ${familyClass}`}>
      <span>{categoryLabel}</span>
      <strong>{getProductCode(product)}</strong>
    </div>
  );
}

function StoreHeader({ currentUser, onSearchChange, query = "", showSearch = true }) {
  const cartCount = useCartCount();

  return (
    <header className={`store-header ${showSearch ? "" : "store-header-compact"}`}>
      <Link className="store-brand" href="/">
        <span className="store-logo">TZ</span>
        <span>
          <strong>TSZR15</strong>
          <small>Compra assistida R15</small>
        </span>
      </Link>

      {showSearch ? (
        <label className="store-search" htmlFor="catalog-search">
          <span>Buscar</span>
          <input
            id="catalog-search"
            onChange={(event) => onSearchChange?.(event.target.value)}
            placeholder='Slider, adesivo, escape...'
            value={query}
          />
        </label>
      ) : null}

      <nav className="store-nav" aria-label="Navegacao principal">
        <Link href="/">Inicio</Link>
        <Link href="/catalogo">Produtos</Link>
        <Link className="cart-nav-link" href="/pedido">
          Carrinho
          <span>{cartCount}</span>
        </Link>
        {currentUser ? (
          <Link className="button button-secondary" href="/conta">
            Minha conta
          </Link>
        ) : (
          <Link className="button button-secondary" href="/entrar">
            Entrar
          </Link>
        )}
      </nav>
    </header>
  );
}

function CategoryRail({ activeCategory, categories, products, setActiveCategory }) {
  return (
    <nav className="category-strip" aria-label="Categorias">
      <button
        className={`category-token ${activeCategory === "all" ? "is-active" : ""}`}
        onClick={() => startTransition(() => setActiveCategory("all"))}
        type="button"
      >
        <span>{products.length}</span>
        Todos
      </button>
      {categories.map((category) => (
        <button
          className={`category-token ${activeCategory === category.id ? "is-active" : ""}`}
          key={category.id}
          onClick={() => startTransition(() => setActiveCategory(category.id))}
          type="button"
        >
          <span>{category.productCount}</span>
          {category.label}
        </button>
      ))}
    </nav>
  );
}

function ProductCard({ product }) {
  const categoryLabels = formatCategoryLabels(product.storefrontCategoryIds);

  return (
    <Link className="hub-product-card" href={getProductHref(product)}>
      <ProductVisual product={product} />

      <div className="hub-product-copy">
        <div className="badge-row">
          <span className="badge badge-category">{categoryLabels[0] ?? "R15"}</span>
          <span className="badge badge-family">{getProductFamilyLabel(product.productFamily)}</span>
        </div>

        <h2>{product.name}</h2>
        <p>{getProductSummary(product)}</p>

        <div className="card-price-row">
          <strong>{formatCurrency(product.priceCents)}</strong>
          <span>Ver detalhes</span>
        </div>
      </div>
    </Link>
  );
}

export function CatalogHub({ categories, currentUser, products }) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalizeSearch(deferredQuery);

  const visibleProducts = products.filter((product) => {
    const matchesCategory =
      activeCategory === "all" || product.storefrontCategoryIds.includes(activeCategory);
    const searchable = normalizeSearch(`${product.name} ${product.productFamily}`);
    const matchesQuery = normalizedQuery.length === 0 || searchable.includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });

  function setSearchValue(value) {
    startTransition(() => setQuery(value));
  }

  return (
    <>
      <StoreHeader currentUser={currentUser} onSearchChange={setSearchValue} query={query} />

      <section className="hub-intro">
        <div>
          <p className="section-label">Catalogo R15</p>
          <h1>Escolha o produto no card e monte os detalhes na pagina dele.</h1>
        </div>
        <p>
          A home fica como vitrine: imagem, preco e explicacao curta. Cor, variacao, quantidade e
          carrinho ficam no fluxo do produto e do pedido.
        </p>
      </section>

      <CategoryRail
        activeCategory={activeCategory}
        categories={categories}
        products={products}
        setActiveCategory={setActiveCategory}
      />

      {visibleProducts.length === 0 ? (
        <div className="empty-state">
          <p className="empty-copy">
            Nenhum produto encontrado com esse filtro. Tente outro termo ou abra todos.
          </p>
        </div>
      ) : (
        <section className="product-grid" aria-label="Produtos TSZR15">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </section>
      )}
    </>
  );
}

export function ProductDetails({ currentUser, product, relatedProducts = [] }) {
  const [selectedVariation, setSelectedVariation] = useState(product.variations[0]);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState("");
  const categoryLabels = formatCategoryLabels(product.storefrontCategoryIds);
  const totalCents = product.priceCents * quantity;

  function addToCart() {
    const currentCart = readStoredCart();
    const cartKey = `${product.id}:${selectedVariation}`;
    const existingItem = currentCart.find((item) => item.cartKey === cartKey);
    const nextItems = existingItem
      ? currentCart.map((item) =>
          item.cartKey === cartKey ? { ...item, quantity: item.quantity + quantity } : item
        )
      : [
          ...currentCart,
          {
            cartKey,
            id: product.id,
            name: product.name,
            priceCents: product.priceCents,
            productFamily: product.productFamily,
            quantity,
            slug: product.slug,
            variation: selectedVariation
          }
        ];

    writeStoredCart(nextItems);
    setFeedback("Produto adicionado ao carrinho.");
  }

  return (
    <>
      <StoreHeader currentUser={currentUser} showSearch={false} />

      <section className="product-detail-layout">
        <div className="product-detail-media">
          <ProductVisual product={product} size="detail" />
          <div className="detail-assist-box">
            <strong>Compra assistida</strong>
            <span>
              Voce compra com a TSZR15. A operacao interna valida disponibilidade e entrega antes
              de fechar o atendimento.
            </span>
          </div>
        </div>

        <article className="product-detail-panel">
          <Link className="back-link" href="/">
            Voltar para produtos
          </Link>
          <div className="badge-row">
            {categoryLabels.map((label) => (
              <span className="badge badge-category" key={label}>
                {label}
              </span>
            ))}
            <span className="badge badge-family">{getProductFamilyLabel(product.productFamily)}</span>
          </div>

          <h1>{product.name}</h1>
          <p className="detail-summary">{getProductSummary(product)}</p>
          <strong className="detail-price">{formatCurrency(product.priceCents)}</strong>

          <div className="option-group">
            <span>Cor / variacao</span>
            <div className="variation-grid" role="list">
              {product.variations.map((variation) => (
                <button
                  className={selectedVariation === variation ? "is-active" : ""}
                  key={variation}
                  onClick={() => setSelectedVariation(variation)}
                  type="button"
                >
                  {variation}
                </button>
              ))}
            </div>
          </div>

          <div className="quantity-row">
            <span>Quantidade</span>
            <div className="quantity-control">
              <button onClick={() => setQuantity((current) => Math.max(current - 1, 1))} type="button">
                -
              </button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity((current) => Math.min(current + 1, 99))} type="button">
                +
              </button>
            </div>
            <strong>{formatCurrency(totalCents)}</strong>
          </div>

          <dl className="product-info-grid">
            <div>
              <dt>Modelo</dt>
              <dd>Yamaha R15</dd>
            </div>
            <div>
              <dt>Prazo de confirmacao</dt>
              <dd>Ate {product.leadTimeDays} dias uteis</dd>
            </div>
            <div>
              <dt>Disponibilidade</dt>
              <dd>{product.availability === "sob-consulta" ? "Sob consulta" : product.availability}</dd>
            </div>
            <div>
              <dt>Fechamento</dt>
              <dd>WhatsApp TSZR15</dd>
            </div>
          </dl>

          {feedback ? <p className="form-alert">{feedback}</p> : null}

          <div className="detail-actions">
            <button className="button button-primary" onClick={addToCart} type="button">
              Adicionar ao carrinho
            </button>
            <Link className="button button-secondary" href="/pedido">
              Ir para o carrinho
            </Link>
          </div>
        </article>
      </section>

      {relatedProducts.length > 0 ? (
        <section className="related-section">
          <div className="section-heading compact-heading">
            <div>
              <p className="section-label">Produtos relacionados</p>
              <h2>Continue vendo itens da mesma linha.</h2>
            </div>
          </div>
          <div className="product-grid related-grid">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function CartCheckout({
  currentUser,
  initialCustomer,
  isSupabaseConfigured,
  products
}) {
  const [cartItems, setCartItems] = useState([]);
  const [hasLoadedCart, setHasLoadedCart] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("pix");
  const [shippingOptionId, setShippingOptionId] = useState("combinar");
  const [hasDataConsent, setHasDataConsent] = useState(Boolean(currentUser));
  const [checkoutFeedback, setCheckoutFeedback] = useState("");
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState(false);
  const [customer, setCustomer] = useState(() => getInitialCustomer(initialCustomer));
  const isAuthenticated = Boolean(currentUser);

  useEffect(() => {
    const sanitizedItems = sanitizeCartItems(readStoredCart(), products);
    setCartItems(sanitizedItems);
    setHasLoadedCart(true);
    writeStoredCart(sanitizedItems);
  }, [products]);

  useEffect(() => {
    if (hasLoadedCart) {
      writeStoredCart(cartItems);
    }
  }, [cartItems, hasLoadedCart]);

  const totals = useMemo(
    () => calculateCartTotals(cartItems, shippingOptionId),
    [cartItems, shippingOptionId]
  );
  const hasRequiredCustomerData = Boolean(
    customer.name && (customer.whatsapp || customer.phone) && customer.cep && customer.address
  );
  const canCheckout = cartItems.length > 0 && hasDataConsent && hasRequiredCustomerData;
  const whatsappMessage = useMemo(
    () =>
      buildWhatsAppOrderMessage({
        cartItems,
        customer,
        paymentMethodId,
        shippingOptionId,
        storeName
      }),
    [cartItems, customer, paymentMethodId, shippingOptionId]
  );

  function updateQuantity(cartKey, nextQuantity) {
    setCartItems((currentItems) =>
      currentItems
        .map((item) =>
          item.cartKey === cartKey ? { ...item, quantity: Math.max(nextQuantity, 0) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function updateCustomer(field, value) {
    setCustomer((currentCustomer) => ({
      ...currentCustomer,
      [field]: value
    }));
  }

  async function submitCheckout() {
    if (!canCheckout || isSubmittingCheckout) {
      return;
    }

    setCheckoutFeedback("");
    setIsSubmittingCheckout(true);

    try {
      const response = await fetch("/api/checkout/whatsapp", {
        body: JSON.stringify({
          cartItems,
          customer,
          hasDataConsent,
          paymentMethodId,
          shippingOptionId
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        const details = Array.isArray(data.details) ? data.details.join(" ") : "";
        throw new Error([data.error, details].filter(Boolean).join(" "));
      }

      if (!data.whatsappUrl) {
        throw new Error("Numero do WhatsApp Business nao configurado.");
      }

      if (data.order?.saved && data.order?.orderNumber) {
        setCheckoutFeedback(`Pedido ${data.order.orderNumber} salvo. Abrindo WhatsApp.`);
      } else if (data.order?.reason) {
        setCheckoutFeedback(`Mensagem pronta. ${data.order.reason}`);
      } else {
        setCheckoutFeedback("Mensagem pronta. Abrindo WhatsApp.");
      }

      window.open(data.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setCheckoutFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel finalizar o pedido agora."
      );
    } finally {
      setIsSubmittingCheckout(false);
    }
  }

  return (
    <>
      <StoreHeader currentUser={currentUser} showSearch={false} />

      <section className="cart-heading">
        <div>
          <p className="section-label">Carrinho de compra</p>
          <h1>Revise os itens e finalize o pedido em uma tela separada.</h1>
        </div>
        <Link className="button button-secondary" href="/">
          Continuar comprando
        </Link>
      </section>

      <section className="cart-page-layout">
        <div className="cart-items-panel">
          <div className="panel-heading">
            <h2>Itens no carrinho</h2>
            <strong>{formatCurrency(totals.subtotalCents)}</strong>
          </div>

          {!hasLoadedCart ? (
            <p className="empty-copy">Carregando carrinho...</p>
          ) : cartItems.length === 0 ? (
            <div className="empty-cart">
              <p>Seu carrinho ainda esta vazio.</p>
              <Link className="button button-primary" href="/">
                Ver produtos
              </Link>
            </div>
          ) : (
            <div className="cart-line-list">
              {cartItems.map((item) => (
                <article className="cart-line" key={item.cartKey}>
                  <div className={`cart-line-image family-${item.productFamily}`}>
                    {item.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.variation}</span>
                  </div>
                  <div className="quantity-control">
                    <button
                      onClick={() => updateQuantity(item.cartKey, item.quantity - 1)}
                      type="button"
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.cartKey, item.quantity + 1)}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <strong>{formatCurrency(item.priceCents * item.quantity)}</strong>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="cart-summary-panel">
          <div className="checkout-header">
            <p className="section-label">Resumo do pedido</p>
            <h2>{formatCurrency(totals.totalCents)}</h2>
          </div>

          {!isAuthenticated ? (
            <div className="account-nudge">
              <strong>Compre mais rapido</strong>
              <span>Crie conta para salvar dados de entrega e preencher o checkout.</span>
              <Link href={isSupabaseConfigured ? "/cadastrar" : "/conta"}>Cadastrar cliente</Link>
            </div>
          ) : (
            <div className="account-nudge is-signed">
              <strong>Dados da sua conta carregados</strong>
              <span>Voce pode editar qualquer campo antes de enviar ao atendimento.</span>
            </div>
          )}

          <div className="checkout-form">
            <label>
              <span>Nome</span>
              <input
                onChange={(event) => updateCustomer("name", event.target.value)}
                placeholder="Nome do cliente"
                value={customer.name}
              />
            </label>
            <label>
              <span>CPF/CNPJ</span>
              <input
                onChange={(event) => updateCustomer("taxId", event.target.value)}
                placeholder="Opcional quando nao exigido"
                value={customer.taxId}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                onChange={(event) => updateCustomer("email", event.target.value)}
                placeholder="voce@email.com"
                type="email"
                value={customer.email}
              />
            </label>
            <label>
              <span>WhatsApp</span>
              <input
                onChange={(event) => updateCustomer("whatsapp", event.target.value)}
                placeholder="(00) 00000-0000"
                value={customer.whatsapp}
              />
            </label>
            <label>
              <span>Telefone opcional</span>
              <input
                onChange={(event) => updateCustomer("phone", event.target.value)}
                placeholder="Telefone alternativo"
                value={customer.phone}
              />
            </label>
            <label>
              <span>CEP</span>
              <input
                onChange={(event) => updateCustomer("cep", event.target.value)}
                placeholder="00000-000"
                value={customer.cep}
              />
            </label>
            <label className="span-all">
              <span>Endereco completo</span>
              <input
                onChange={(event) => updateCustomer("address", event.target.value)}
                placeholder="Rua, numero, bairro, cidade/UF"
                value={customer.address}
              />
            </label>
            <label>
              <span>Pagamento</span>
              <select
                onChange={(event) => setPaymentMethodId(event.target.value)}
                value={paymentMethodId}
              >
                {paymentMethods.map((paymentMethod) => (
                  <option key={paymentMethod.id} value={paymentMethod.id}>
                    {paymentMethod.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Frete</span>
              <select
                onChange={(event) => setShippingOptionId(event.target.value)}
                value={shippingOptionId}
              >
                {shippingOptions.map((shippingOption) => (
                  <option key={shippingOption.id} value={shippingOption.id}>
                    {shippingOption.label} - {formatCurrency(shippingOption.priceCents)}
                  </option>
                ))}
              </select>
            </label>
            <label className="span-all">
              <span>Observacoes</span>
              <textarea
                onChange={(event) => updateCustomer("notes", event.target.value)}
                placeholder="Cor, urgencia, duvida ou combinacao especial"
                value={customer.notes}
              />
            </label>
            <label className="consent-box span-all">
              <input
                checked={hasDataConsent}
                onChange={(event) => setHasDataConsent(event.target.checked)}
                type="checkbox"
              />
              <span>{ASSISTED_PURCHASE_CONSENT_TEXT}</span>
            </label>
          </div>

          <div className="total-box">
            <span>Subtotal</span>
            <strong>{formatCurrency(totals.subtotalCents)}</strong>
            <span>Frete</span>
            <strong>{formatCurrency(totals.shippingCents)}</strong>
            <span>Total</span>
            <strong>{formatCurrency(totals.totalCents)}</strong>
          </div>

          <textarea className="message-preview" readOnly value={whatsappMessage} />

          <p className="checkout-note">
            {cartItems.length === 0
              ? "Adicione pelo menos um item para liberar o envio."
              : !hasRequiredCustomerData
                ? "Preencha nome, WhatsApp, CEP e endereco para enviar."
                : hasDataConsent
                  ? "Pedido pronto para enviar ao atendimento."
                  : "Confirme o aceite de dados para liberar o envio."}
          </p>

          {checkoutFeedback ? <p className="checkout-note">{checkoutFeedback}</p> : null}

          <button
            className={`button button-primary checkout-button ${
              !canCheckout || isSubmittingCheckout ? "is-disabled" : ""
            }`}
            disabled={!canCheckout || isSubmittingCheckout}
            onClick={submitCheckout}
            type="button"
          >
            {isSubmittingCheckout ? "Salvando pedido..." : "Enviar pedido no WhatsApp"}
          </button>
        </aside>
      </section>
    </>
  );
}
