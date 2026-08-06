import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import Link from "next/link";

import { archiveAdminCouponAction, upsertAdminCouponAction } from "@/app/admin/actions.js";
import {
  AdminListPagination,
  formatCurrency,
  productPriceToInput,
  RequiredMark
} from "@/app/admin/_components/admin-ui.js";
import { formatAdminDateTimeInput } from "@/src/admin/admin-form-values.js";

function CouponList({ coupons, pagination, selectedCouponCode }) {
  return (
    <aside className={cx(globalStyles, "admin-list-panel")}>
      <div className={cx(globalStyles, "admin-panel-heading")}>
        <p className={cx(globalStyles, "section-label")}>Promocoes</p>
        <strong>{pagination.total} cupons</strong>
      </div>

      <div className={cx(globalStyles, "admin-product-list")}>
        <Link
          className={cx(
            globalStyles,
            `admin-product-link ${!selectedCouponCode ? "is-active" : ""}`
          )}
          href="/admin/cupons"
        >
          <span>
            <strong>Criar cupom</strong>
            <em>Nova regra de desconto</em>
          </span>
          <small>Novo</small>
        </Link>

        {coupons.map((coupon) => (
          <Link
            className={cx(
              globalStyles,
              `admin-product-link ${selectedCouponCode === coupon.code ? "is-active" : ""}`
            )}
            href={`/admin/cupons?paginaCupons=${pagination.page}&cupom=${encodeURIComponent(coupon.code)}`}
            key={coupon.id}
          >
            <span>
              <strong>{coupon.code}</strong>
              <em>
                {coupon.discountType === "percent"
                  ? `${coupon.discountPercent}%`
                  : formatCurrency(coupon.discountCents)}
              </em>
            </span>
            <small>
              {coupon.isActive ? "Ativo" : "Inativo"} - {coupon.redemptionCount} uso(s)
            </small>
          </Link>
        ))}
      </div>
      <AdminListPagination
        basePath="/admin/cupons"
        label="cupons"
        page={pagination.page}
        pageCount={pagination.pageCount}
        pageParam="paginaCupons"
      />
    </aside>
  );
}

function CouponForm({ categories, coupon, products }) {
  const selectedProductIds = new Set(coupon?.appliesToProductIds ?? []);
  const selectedCategoryIds = new Set(coupon?.appliesToCategoryIds ?? []);
  const discountType = coupon?.discountType ?? "percent";

  return (
    <form
      action={upsertAdminCouponAction}
      className={cx(globalStyles, "admin-operation-form admin-product-form")}
    >
      <input name="couponId" type="hidden" value={coupon?.id ?? ""} />
      <div className={cx(globalStyles, "admin-form-block")}>
        <h2>{coupon ? `Cupom ${coupon.code}` : "Novo cupom"}</h2>
        <div className={cx(globalStyles, "form-grid")}>
          <label>
            <span>
              Codigo <RequiredMark />
            </span>
            <input
              autoComplete="off"
              defaultValue={coupon?.code ?? ""}
              name="couponCode"
              pattern="[A-Za-z0-9_-]{3,40}"
              placeholder="R15OFF"
              required
              title="Use letras, numeros, hifen ou underline."
            />
          </label>
          <div className={cx(globalStyles, "admin-form-inline-field")}>
            <span>Status</span>
            <label className={cx(globalStyles, "admin-toggle-row")}>
              <input
                defaultChecked={coupon?.isActive ?? false}
                name="couponIsActive"
                type="checkbox"
              />
              <span>Cupom ativo</span>
            </label>
            <small>Ative somente quando a regra estiver revisada e pronta para uso.</small>
          </div>
          <label className={cx(globalStyles, "span-all")}>
            <span>Descricao interna</span>
            <input
              defaultValue={coupon?.description ?? ""}
              name="couponDescription"
              placeholder="Ex: campanha de lancamento"
            />
          </label>
        </div>
      </div>

      <div className={cx(globalStyles, "admin-form-block")}>
        <h2>Desconto</h2>
        <div className={cx(globalStyles, "form-grid")}>
          <label>
            <span>
              Tipo <RequiredMark />
            </span>
            <select defaultValue={discountType} name="discountType" required>
              <option value="percent">Percentual</option>
              <option value="fixed">Valor fixo</option>
            </select>
          </label>
          <label>
            <span>Percentual</span>
            <input
              defaultValue={coupon?.discountPercent ?? ""}
              max="100"
              min="1"
              name="discountPercent"
              placeholder="10"
              type="number"
            />
            <small>Usado quando o tipo for percentual.</small>
          </label>
          <label>
            <span>Valor fixo</span>
            <input
              defaultValue={productPriceToInput(coupon?.discountCents)}
              inputMode="decimal"
              name="discountValue"
              pattern="[0-9.,]+"
              placeholder="50,00"
            />
            <small>Usado quando o tipo for valor fixo.</small>
          </label>
          <label>
            <span>Subtotal minimo</span>
            <input
              defaultValue={productPriceToInput(coupon?.minimumSubtotalCents)}
              inputMode="decimal"
              name="minimumSubtotal"
              pattern="[0-9.,]+"
              placeholder="0,00"
            />
          </label>
          <label>
            <span>Limite de usos</span>
            <input
              defaultValue={coupon?.maxRedemptions ?? ""}
              min="1"
              name="maxRedemptions"
              placeholder="sem limite"
              type="number"
            />
          </label>
        </div>
      </div>

      <div className={cx(globalStyles, "admin-form-block")}>
        <h2>Validade e aplicacao</h2>
        <div className={cx(globalStyles, "form-grid")}>
          <label>
            <span>Comeca em</span>
            <input
              defaultValue={formatAdminDateTimeInput(coupon?.startsAt)}
              name="startsAt"
              type="datetime-local"
            />
            <small>Horario de Brasilia.</small>
          </label>
          <label>
            <span>Expira em</span>
            <input
              defaultValue={formatAdminDateTimeInput(coupon?.expiresAt)}
              name="expiresAt"
              type="datetime-local"
            />
            <small>Horario de Brasilia.</small>
          </label>
          <fieldset className={cx(globalStyles, "span-all admin-checkbox-fieldset")}>
            <legend>Categorias aplicaveis</legend>
            <div className={cx(globalStyles, "admin-checkbox-grid")}>
              {categories.map((category) => (
                <label key={category.id}>
                  <input
                    defaultChecked={selectedCategoryIds.has(category.id)}
                    name="couponCategoryIds"
                    type="checkbox"
                    value={category.id}
                  />
                  <span>{category.label}</span>
                </label>
              ))}
            </div>
            <p className={cx(globalStyles, "form-helper-text")}>
              Sem categoria e sem produto selecionado, o cupom vale para todo o carrinho.
            </p>
          </fieldset>
          <fieldset
            className={cx(
              globalStyles,
              "span-all admin-checkbox-fieldset admin-product-coupon-fieldset"
            )}
          >
            <legend>Produtos aplicaveis</legend>
            <div className={cx(globalStyles, "admin-checkbox-grid")}>
              {products.map((product) => (
                <label key={product.id}>
                  <input
                    defaultChecked={selectedProductIds.has(product.id)}
                    name="couponProductIds"
                    type="checkbox"
                    value={product.id}
                  />
                  <span>{product.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className={cx(globalStyles, "admin-product-actions")}>
        <button className={cx(globalStyles, "button button-primary")} type="submit">
          Salvar cupom
        </button>
      </div>
    </form>
  );
}

export function AdminCoupons({ selectedCouponCode, state }) {
  const selectedCoupon = state.coupons.find((coupon) => coupon.code === selectedCouponCode);

  return (
    <section className={cx(globalStyles, "admin-shell admin-products-shell")}>
      <CouponList
        coupons={state.coupons}
        pagination={state.pagination.coupons}
        selectedCouponCode={selectedCouponCode}
      />

      <div className={cx(globalStyles, "admin-detail-panel admin-product-panel")}>
        <CouponForm
          categories={state.categories}
          coupon={selectedCoupon}
          products={state.couponProductOptions}
        />

        {state.couponProductOptionsTruncated ? (
          <p className={cx(globalStyles, "helper-text")}>
            A seleção exibe os primeiros 500 produtos por nome. Use categorias para regras mais
            amplas.
          </p>
        ) : null}

        {selectedCoupon ? (
          <form
            action={archiveAdminCouponAction}
            className={cx(globalStyles, "admin-archive-form")}
          >
            <input name="couponId" type="hidden" value={selectedCoupon.id} />
            <button className={cx(globalStyles, "button button-secondary")} type="submit">
              Desativar cupom
            </button>
            <p>O cupom fica no historico e deixa de validar no carrinho.</p>
          </form>
        ) : null}
      </div>
    </section>
  );
}
