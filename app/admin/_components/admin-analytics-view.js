import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";

import { moderateOrderReviewAction } from "@/app/admin/actions.js";
import { formatCurrency } from "@/app/admin/_components/admin-ui.js";
import { formatAdminDisplayDateTime as formatDateTime } from "@/src/admin/admin-form-values.js";

function MetricCard({ label, value, detail, tone = "" }) {
  return (
    <div className={cx(globalStyles, `admin-metric-card ${tone ? `is-${tone}` : ""}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function ReviewStars({ rating = 0 }) {
  return (
    <span className={cx(globalStyles, "review-stars")} aria-label={`${rating} de 5 estrelas`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span className={cx(globalStyles, index < rating ? "is-filled" : "")} key={index}>
          {"\u2605"}
        </span>
      ))}
    </span>
  );
}

function PendingReviewCard({ review }) {
  return (
    <article className={cx(globalStyles, "admin-review-card")}>
      <div className={cx(globalStyles, "admin-review-head")}>
        <div>
          <strong>{review.productName}</strong>
          <span>Pedido {review.orderNumber || "sem numero"}</span>
        </div>
        <ReviewStars rating={review.rating} />
      </div>

      <p>{review.comment}</p>
      <small>
        {review.publicName} - {formatDateTime(review.createdAt)}
      </small>

      {review.photos?.length ? (
        <div className={cx(globalStyles, "admin-review-photo-row")}>
          {review.photos.map((photo) => (
            <img alt="" key={photo.id} src={photo.url} />
          ))}
        </div>
      ) : null}

      <div className={cx(globalStyles, "admin-review-actions")}>
        <form action={moderateOrderReviewAction}>
          <input name="reviewId" type="hidden" value={review.id} />
          <input name="reviewStatus" type="hidden" value="approved" />
          <button className={cx(globalStyles, "button button-success")} type="submit">
            Aprovar
          </button>
        </form>
        <form action={moderateOrderReviewAction}>
          <input name="reviewId" type="hidden" value={review.id} />
          <input name="reviewStatus" type="hidden" value="rejected" />
          <input name="moderationNote" type="hidden" value="Conteudo recusado pela moderacao." />
          <button className={cx(globalStyles, "button button-danger")} type="submit">
            Recusar
          </button>
        </form>
      </div>
    </article>
  );
}

export function AdminAnalytics({ analytics, pendingReviews = [] }) {
  const statusCounts = analytics.internalStatusCounts ?? {};

  return (
    <section className={cx(globalStyles, "admin-analytics-shell")}>
      <div className={cx(globalStyles, "admin-metric-grid")}>
        <MetricCard
          detail={`${analytics.activeOrderCount} pedidos ativos`}
          label="Quantidade de vendas"
          value={analytics.salesCount}
        />
        <MetricCard
          detail={`${formatCurrency(analytics.knownCostCents)} em custos conhecidos`}
          label="Lucro estimado"
          tone={analytics.grossProfitCents >= 0 ? "positive" : "negative"}
          value={formatCurrency(analytics.grossProfitCents)}
        />
        <MetricCard
          detail={`${analytics.totalOrderCount} pedidos no historico`}
          label="Receita confirmada"
          value={formatCurrency(analytics.totalRevenueCents)}
        />
        <MetricCard
          detail="media dos pedidos confirmados"
          label="Ticket medio"
          value={formatCurrency(analytics.averageTicketCents)}
        />
      </div>

      <div className={cx(globalStyles, "admin-chart-grid")}>
        <section className={cx(globalStyles, "admin-section")}>
          <h2>Vendas dos ultimos 7 dias</h2>
          <div className={cx(globalStyles, "admin-bar-chart")}>
            {analytics.dailySales.map((day) => (
              <div className={cx(globalStyles, "admin-bar-row")} key={day.key}>
                <span>{day.label}</span>
                <div>
                  <i style={{ width: `${Math.max(4, day.percentage)}%` }} />
                </div>
                <strong>{formatCurrency(day.totalCents)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className={cx(globalStyles, "admin-section")}>
          <h2>Usuarios que mais compraram</h2>
          <div className={cx(globalStyles, "admin-ranking-list")}>
            {analytics.topCustomers.length === 0 ? (
              <p className={cx(globalStyles, "helper-text")}>
                Ainda nao ha compras confirmadas para ranking.
              </p>
            ) : (
              analytics.topCustomers.map((customer, index) => (
                <div className={cx(globalStyles, "admin-ranking-row")} key={customer.key}>
                  <span>{index + 1}</span>
                  <strong>{customer.name}</strong>
                  <small>
                    {customer.count} pedido(s) - {formatCurrency(customer.totalCents)}
                  </small>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={cx(globalStyles, "admin-section")}>
          <h2>Status interno</h2>
          <div className={cx(globalStyles, "admin-status-summary")}>
            <div className={cx(globalStyles, "internal-order-confirmado")}>
              <strong>{statusCounts.confirmado ?? 0}</strong>
              <span>Confirmados</span>
            </div>
            <div className={cx(globalStyles, "internal-order-pendente")}>
              <strong>{statusCounts.pendente ?? 0}</strong>
              <span>Pendentes</span>
            </div>
            <div className={cx(globalStyles, "internal-order-recusado")}>
              <strong>{statusCounts.recusado ?? 0}</strong>
              <span>Recusados</span>
            </div>
            <div>
              <strong>{statusCounts.novo ?? 0}</strong>
              <span>Novos sem decisao</span>
            </div>
          </div>
        </section>

        <section className={cx(globalStyles, "admin-section")}>
          <h2>Itens mais vendidos</h2>
          <div className={cx(globalStyles, "admin-ranking-list")}>
            {analytics.topSoldItems?.length ? (
              analytics.topSoldItems.map((item, index) => (
                <div className={cx(globalStyles, "admin-ranking-row")} key={item.key}>
                  <span>{index + 1}</span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.quantity} un. - {formatCurrency(item.totalCents)}
                  </small>
                </div>
              ))
            ) : (
              <p className={cx(globalStyles, "helper-text")}>
                Sem pedidos confirmados para ranking de produtos.
              </p>
            )}
          </div>
        </section>

        <section className={cx(globalStyles, "admin-section")}>
          <h2>Itens mais bem avaliados</h2>
          <div className={cx(globalStyles, "admin-ranking-list")}>
            {analytics.topRatedItems?.length ? (
              analytics.topRatedItems.map((item, index) => (
                <div className={cx(globalStyles, "admin-ranking-row")} key={item.key}>
                  <span>{index + 1}</span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.averageRating.toFixed(1)} estrelas - {item.reviewCount} avaliacao(oes)
                  </small>
                </div>
              ))
            ) : (
              <p className={cx(globalStyles, "helper-text")}>
                Sem avaliacoes aprovadas para ranking.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className={cx(globalStyles, "admin-section admin-review-moderation")}>
        <div className={cx(globalStyles, "admin-panel-heading")}>
          <p className={cx(globalStyles, "section-label")}>Moderacao</p>
          <h2>Avaliacoes pendentes</h2>
        </div>
        {pendingReviews.length === 0 ? (
          <p className={cx(globalStyles, "helper-text")}>Nenhuma avaliacao aguardando aprovacao.</p>
        ) : (
          <div className={cx(globalStyles, "admin-review-grid")}>
            {pendingReviews.map((review) => (
              <PendingReviewCard key={review.id} review={review} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
