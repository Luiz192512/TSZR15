import {
  blockedMotorcycleKeywords,
  catalogProducts,
  formatCategoryLabels,
  getConfiguratorProducts,
  getStorefrontMenu,
  rawCatalogProducts,
  rejectedCatalogProducts,
  renderSlots
} from "./catalog/index.js";

const statsNode = document.querySelector("#stats");
const categoryFiltersNode = document.querySelector("#category-filters");
const productsGridNode = document.querySelector("#products-grid");
const renderSlotsNode = document.querySelector("#render-slots");
const rejectionsNode = document.querySelector("#rejections");

const state = {
  activeCategory: "all"
};

function renderStats() {
  const configuratorCount = getConfiguratorProducts().length;
  const rejectedCount = rejectedCatalogProducts.length;
  const cards = [
    { label: "Produtos publicados", value: catalogProducts.length },
    { label: "Skus no configurador 3D", value: configuratorCount },
    { label: "Itens rejeitados", value: rejectedCount },
    { label: "Categorias no menu", value: getStorefrontMenu().length }
  ];

  statsNode.innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card">
          <span class="stat-value">${card.value}</span>
          <span class="stat-label">${card.label}</span>
        </article>
      `
    )
    .join("");
}

function renderCategoryFilters() {
  const categories = [{ id: "all", label: "Todos" }, ...getStorefrontMenu()];
  categoryFiltersNode.innerHTML = categories
    .map((category) => {
      const isActive = category.id === state.activeCategory;
      const count = category.id === "all" ? catalogProducts.length : category.productCount;
      return `
        <button class="pill ${isActive ? "is-active" : ""}" data-category-id="${category.id}">
          ${category.label} <span>(${count})</span>
        </button>
      `;
    })
    .join("");

  categoryFiltersNode.querySelectorAll("[data-category-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.categoryId;
      renderCategoryFilters();
      renderProducts();
    });
  });
}

function getVisibleProducts() {
  if (state.activeCategory === "all") {
    return catalogProducts;
  }

  return catalogProducts.filter((product) =>
    product.storefrontCategoryIds.includes(state.activeCategory)
  );
}

function renderProducts() {
  const products = getVisibleProducts();
  productsGridNode.innerHTML = products
    .map((product) => {
      const categoryBadges = formatCategoryLabels(product.storefrontCategoryIds)
        .map((label) => `<span class="badge badge-category">${label}</span>`)
        .join("");

      return `
        <article class="product-card">
          <div class="badge-row">
            ${categoryBadges}
            <span class="badge badge-family">${product.productFamily}</span>
            ${
              product.is3DEligible
                ? '<span class="badge badge-3d">Pronto para 3D</span>'
                : ""
            }
          </div>
          <h3>${product.name}</h3>
          <dl class="meta-list">
            <div class="meta-line"><strong>Escopo:</strong> ${product.bikeModelScope.join(", ")}</div>
            <div class="meta-line"><strong>Slot:</strong> ${product.renderSlot ?? "fora do configurador"}</div>
            <div class="meta-line"><strong>Fornecedor:</strong> ${product.supplierSource.provider}</div>
          </dl>
        </article>
      `;
    })
    .join("");
}

function renderSlots() {
  renderSlotsNode.innerHTML = renderSlots
    .map((slot) => `<li>${slot}</li>`)
    .join("");
}

function renderRejections() {
  rejectionsNode.innerHTML = `
    <article class="rejection-card">
      <h3>Filtro ativo</h3>
      <p>Bloqueia automaticamente: ${blockedMotorcycleKeywords.join(", ")} e qualquer item da categoria vestuario, com excecoes aprovadas para referencias visuais da R15.</p>
    </article>
    ${rejectedCatalogProducts
      .map(
        (product) => `
          <article class="rejection-card">
            <h3>${product.name}</h3>
            <p>${product.importDecision.message}</p>
          </article>
        `
      )
      .join("")}
    <article class="rejection-card">
      <h3>Resultado do importador</h3>
      <p>${rawCatalogProducts.length} itens analisados e ${catalogProducts.length} itens publicados para a R15.</p>
    </article>
  `;
}

renderStats();
renderCategoryFilters();
renderProducts();
renderSlots();
renderRejections();
