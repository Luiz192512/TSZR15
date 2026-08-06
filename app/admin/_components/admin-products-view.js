import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";

import { archiveAdminProductAction, upsertAdminProductAction } from "@/app/admin/actions.js";
import {
  AdminListPagination,
  arrayToTextarea,
  formatCurrency,
  productCostToInput,
  productPriceToInput,
  RequiredMark
} from "@/app/admin/_components/admin-ui.js";
import { formatCategoryLabels } from "@/src/catalog/categories.js";
import { AdminProductForm } from "@/src/components/admin/admin-product-form.js";
import { ProductImageUploader } from "@/src/components/admin/product-image-uploader.js";

export function getNewProductCount(params) {
  const count = Number.parseInt(String(params?.novosProdutos ?? ""), 10);

  return Number.isInteger(count) && count > 0 ? Math.min(count, 12) : 0;
}

export function buildAddProductHref({
  newProductCount = 0,
  productPage = 1,
  selectedProductId = ""
} = {}) {
  const currentDraftCount = selectedProductId ? newProductCount : Math.max(newProductCount, 1);
  const nextDraftCount = Math.min(currentDraftCount + 1, 12);
  const pageQuery = productPage > 1 ? `&paginaProdutos=${productPage}` : "";

  return `/admin/produtos?novosProdutos=${nextDraftCount}${pageQuery}`;
}

function ProductList({ newProductCount, pagination, products, selectedProductId }) {
  return (
    <aside className={cx(globalStyles, "admin-list-panel")}>
      <div className={cx(globalStyles, "admin-panel-heading")}>
        <p className={cx(globalStyles, "section-label")}>Catalogo</p>
        <strong>{pagination.total} produtos</strong>
      </div>

      <div className={cx(globalStyles, "admin-product-list")}>
        <Link
          className={cx(
            globalStyles,
            `admin-product-link ${!selectedProductId ? "is-active" : ""}`
          )}
          href={buildAddProductHref({
            newProductCount,
            productPage: pagination.page,
            selectedProductId
          })}
        >
          <span>
            <strong>Adicionar produto</strong>
            <em>Criar outro card vazio</em>
          </span>
          <small>{selectedProductId ? "Novo" : `${Math.max(newProductCount, 1)} aberto(s)`}</small>
        </Link>

        {products.map((product) => (
          <Link
            className={cx(
              globalStyles,
              `admin-product-link ${selectedProductId === product.id ? "is-active" : ""}`
            )}
            href={`/admin/produtos?paginaProdutos=${pagination.page}&produto=${encodeURIComponent(product.id)}`}
            key={product.id}
          >
            <span>
              <strong>{product.name}</strong>
              <em>{formatCategoryLabels(product.storefrontCategoryIds).join(", ")}</em>
            </span>
            <small>
              {product.isPublished ? "Publicado" : "Arquivado"}
              {Number.isInteger(product.profitCents)
                ? ` - lucro ${formatCurrency(product.profitCents, product.currency)}`
                : ""}
            </small>
          </Link>
        ))}
      </div>
      <AdminListPagination
        basePath="/admin/produtos"
        label="produtos"
        page={pagination.page}
        pageCount={pagination.pageCount}
        pageParam="paginaProdutos"
      />
    </aside>
  );
}

function ProductForm({ categories, draftIndex = 0, families, product }) {
  const selectedCategoryIds = new Set(
    product?.storefrontCategoryIds?.length
      ? product.storefrontCategoryIds
      : [categories[0]?.id].filter(Boolean)
  );
  const selectedFamily = product?.productFamily ?? families[0] ?? "slider";

  return (
    <AdminProductForm
      action={upsertAdminProductAction}
      className={cx(globalStyles, "admin-operation-form admin-product-form")}
      errorClassName={cx(globalStyles, "form-alert")}
    >
      <input name="productId" type="hidden" value={product?.id ?? ""} />
      <input name="previousSlug" type="hidden" value={product?.slug ?? ""} />

      <div className={cx(globalStyles, "admin-form-block")}>
        <h2>
          {product
            ? "Identificacao do produto"
            : `Novo produto${draftIndex ? ` #${draftIndex}` : ""}`}
        </h2>
        <div className={cx(globalStyles, "form-grid admin-product-identity-grid")}>
          <label>
            <span>
              Nome <RequiredMark />
            </span>
            <input
              autoComplete="off"
              defaultValue={product?.name ?? ""}
              name="name"
              placeholder="Ex: Ponteira SC Project"
              required
            />
          </label>
          <label>
            <span>Slug / ID</span>
            <input
              autoComplete="off"
              defaultValue={product?.slug ?? ""}
              name="slug"
              placeholder="ex: slider-r15-preto"
            />
            <small>Opcional. Se ficar vazio, o sistema gera pelo nome.</small>
          </label>
          <label>
            <span>
              Familia tecnica <RequiredMark />
            </span>
            <select defaultValue={selectedFamily} name="productFamily" required>
              {families.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className={cx(globalStyles, "admin-form-block")}>
        <h2>Preco e operacao</h2>
        <div className={cx(globalStyles, "form-grid admin-product-pricing-grid")}>
          <label>
            <span>
              Preco do cliente <RequiredMark />
            </span>
            <input
              defaultValue={productPriceToInput(product?.priceCents)}
              inputMode="decimal"
              name="price"
              pattern="[0-9.,]+"
              placeholder="199,90"
              required
              title="Use um valor como 199,90, 199.90 ou 2.490,00."
            />
            <small>Valor que aparece no site e sera cobrado do cliente.</small>
          </label>
          <label>
            <span>Preco real interno</span>
            <input
              defaultValue={productCostToInput(product?.costCents)}
              inputMode="decimal"
              name="cost"
              pattern="[0-9.,]+"
              placeholder="120,00"
              title="Custo interno do produto para calculo de lucro."
            />
            <small>Visivel apenas no admin. Fica fora do catalogo publico.</small>
          </label>
          <label>
            <span>Disponibilidade</span>
            <input defaultValue={product?.availability ?? "sob-consulta"} name="availability" />
          </label>
          <label>
            <span>Prazo em dias uteis</span>
            <input
              defaultValue={product?.leadTimeDays ?? 2}
              min="0"
              name="leadTimeDays"
              type="number"
            />
          </label>
          <label>
            <span>Frete</span>
            <input defaultValue={product?.shippingClass ?? "medium"} name="shippingClass" />
          </label>
          <div className={cx(globalStyles, "admin-profit-preview span-all")}>
            <span>Lucro estimado do produto</span>
            <strong>
              {Number.isInteger(product?.profitCents)
                ? formatCurrency(product.profitCents, product.currency)
                : "Informe o preco real para calcular"}
            </strong>
            {Number.isInteger(product?.marginPercent) ? (
              <small>{product.marginPercent}% de margem sobre o preco do cliente</small>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cx(globalStyles, "admin-form-block")}>
        <h2>Categorias e compatibilidade</h2>
        <div className={cx(globalStyles, "form-grid")}>
          <fieldset className={cx(globalStyles, "span-all admin-checkbox-fieldset")}>
            <legend>
              Categorias <RequiredMark />
            </legend>
            <div className={cx(globalStyles, "admin-checkbox-grid")}>
              {categories.map((category) => (
                <label key={category.id}>
                  <input
                    defaultChecked={selectedCategoryIds.has(category.id)}
                    name="categoryIds"
                    type="checkbox"
                    value={category.id}
                  />
                  <span>{category.label}</span>
                </label>
              ))}
            </div>
            <p className={cx(globalStyles, "form-helper-text")}>
              Selecione pelo menos uma categoria para publicar na vitrine.
            </p>
          </fieldset>
          <label className={cx(globalStyles, "span-all")}>
            <span>Escopo tecnico</span>
            <input
              defaultValue={arrayToTextarea(product?.bikeModelScope) || "yamaha-r15"}
              name="bikeModelScope"
            />
          </label>
        </div>
      </div>

      <div className={cx(globalStyles, "admin-form-block")}>
        <h2>Vitrine</h2>
        <div className={cx(globalStyles, "form-grid")}>
          <ProductImageUploader
            existingImageUrls={product?.imageUrls ?? []}
            variationImages={product?.variationImages ?? []}
            variationStock={product?.variationStock ?? []}
            variations={product?.variations ?? ["Padrão"]}
          />
          <label className={cx(globalStyles, "span-all")}>
            <span>Notas</span>
            <textarea defaultValue={product?.notes ?? ""} name="notes" rows={4} />
          </label>
          <label className={cx(globalStyles, "admin-toggle-row span-all")}>
            <input
              defaultChecked={product?.isPublished ?? true}
              name="isPublished"
              type="checkbox"
            />
            <span>Publicado na vitrine</span>
          </label>
        </div>
      </div>

      <div className={cx(globalStyles, "admin-product-actions")}>
        <button className={cx(globalStyles, "button button-primary")} type="submit">
          Salvar produto
        </button>
      </div>
    </AdminProductForm>
  );
}

export function AdminProducts({ newProductCount, selectedProductId, state }) {
  const selectedProduct = state.products.find((product) => product.id === selectedProductId);
  const draftCount = selectedProduct ? newProductCount : Math.max(newProductCount, 1);
  const draftIndexes = Array.from({ length: draftCount }, (_, index) => index + 1);

  return (
    <section className={cx(globalStyles, "admin-shell admin-products-shell")}>
      <ProductList
        newProductCount={newProductCount}
        pagination={state.pagination.products}
        products={state.products}
        selectedProductId={selectedProductId}
      />

      <div className={cx(globalStyles, "admin-detail-panel admin-product-panel")}>
        {selectedProduct ? (
          <ProductForm
            categories={state.categories}
            families={state.families}
            product={selectedProduct}
          />
        ) : null}

        {draftIndexes.map((draftIndex) => (
          <ProductForm
            categories={state.categories}
            draftIndex={draftIndex}
            families={state.families}
            key={`new-product-${draftIndex}`}
          />
        ))}

        {selectedProduct ? (
          <form
            action={archiveAdminProductAction}
            className={cx(globalStyles, "admin-archive-form")}
          >
            <input name="productId" type="hidden" value={selectedProduct.id} />
            <input name="slug" type="hidden" value={selectedProduct.slug} />
            <button className={cx(globalStyles, "button button-secondary")} type="submit">
              Arquivar produto
            </button>
            <p>
              Arquivar equivale a excluir da vitrine: o produto fica com
              <code>is_published=false</code> e nao quebra historico de pedidos.
            </p>
          </form>
        ) : null}
      </div>
    </section>
  );
}
