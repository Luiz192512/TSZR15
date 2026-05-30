const DAY_MS = 24 * 60 * 60 * 1000;

function sumCents(values) {
  return values.reduce((total, value) => total + (Number.isInteger(value) ? value : 0), 0);
}

function getDateKey(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function getCustomerKey(order) {
  return (
    String(order.customer_whatsapp ?? "").trim() ||
    String(order.customer_email ?? "").trim() ||
    String(order.customer_name ?? "").trim() ||
    "Cliente sem contato"
  );
}

function isActiveOrder(order) {
  return order.internal_order_status !== "recusado" && order.operational_status !== "cancelado";
}

function isSalesOrder(order) {
  return (
    isActiveOrder(order) &&
    (order.payment_status === "pagamento_confirmado" ||
      order.internal_order_status === "confirmado")
  );
}

export function buildAdminOrderAnalytics({
  now = new Date(),
  orderItems = [],
  orders = [],
  reviews = [],
  supplierPurchases = []
} = {}) {
  const costsByOrderId = new Map();
  const itemCostsByOrderId = new Map();

  for (const item of orderItems) {
    if (!Number.isInteger(item.subtotal_cost_cents)) {
      continue;
    }

    itemCostsByOrderId.set(
      item.order_id,
      (itemCostsByOrderId.get(item.order_id) ?? 0) + item.subtotal_cost_cents
    );
  }

  for (const purchase of supplierPurchases) {
    const orderId = purchase.order_id;
    const knownCostCents =
      (purchase.product_cost_cents ?? 0) + (purchase.shipping_cost_cents ?? 0);

    costsByOrderId.set(orderId, (costsByOrderId.get(orderId) ?? 0) + knownCostCents);
  }

  const activeOrders = orders.filter(isActiveOrder);
  const salesOrders = orders.filter(isSalesOrder);
  const salesOrderIds = new Set(salesOrders.map((order) => order.id));
  const totalRevenueCents = sumCents(salesOrders.map((order) => order.total_cents));
  const knownCostCents = sumCents(
    salesOrders.map((order) => costsByOrderId.get(order.id) ?? itemCostsByOrderId.get(order.id) ?? 0)
  );
  const grossProfitCents = totalRevenueCents - knownCostCents;
  const averageTicketCents =
    salesOrders.length > 0 ? Math.round(totalRevenueCents / salesOrders.length) : 0;

  const internalStatusCounts = {
    confirmado: 0,
    novo: 0,
    pendente: 0,
    recusado: 0
  };

  for (const order of orders) {
    const status = order.internal_order_status || "novo";
    internalStatusCounts[status] = (internalStatusCounts[status] ?? 0) + 1;
  }

  const customers = new Map();

  for (const order of salesOrders.length ? salesOrders : activeOrders) {
    const key = getCustomerKey(order);
    const previous = customers.get(key) ?? {
      count: 0,
      key,
      name: order.customer_name || "Cliente sem nome",
      totalCents: 0
    };

    previous.count += 1;
    previous.totalCents += order.total_cents ?? 0;
    customers.set(key, previous);
  }

  const topCustomers = Array.from(customers.values())
    .sort((a, b) => b.totalCents - a.totalCents || b.count - a.count)
    .slice(0, 5);

  const soldItems = new Map();

  for (const item of orderItems) {
    if (!salesOrderIds.has(item.order_id)) {
      continue;
    }

    const key = item.product_id || item.product_slug || item.product_name;
    const previous = soldItems.get(key) ?? {
      key,
      name: item.product_name || "Produto sem nome",
      quantity: 0,
      totalCents: 0
    };

    previous.quantity += Number.isInteger(item.quantity) ? item.quantity : 0;
    previous.totalCents += Number.isInteger(item.subtotal_cents) ? item.subtotal_cents : 0;
    soldItems.set(key, previous);
  }

  const topSoldItems = Array.from(soldItems.values())
    .sort((a, b) => b.quantity - a.quantity || b.totalCents - a.totalCents)
    .slice(0, 5);

  const reviewedItems = new Map();

  for (const review of reviews) {
    if (review.status !== "approved" || !Number.isInteger(review.rating)) {
      continue;
    }

    const key = review.product_id || review.product_name;
    const previous = reviewedItems.get(key) ?? {
      key,
      name: review.product_name || "Produto sem nome",
      ratingTotal: 0,
      reviewCount: 0
    };

    previous.ratingTotal += review.rating;
    previous.reviewCount += 1;
    reviewedItems.set(key, previous);
  }

  const topRatedItems = Array.from(reviewedItems.values())
    .map((item) => ({
      averageRating: Math.round((item.ratingTotal / item.reviewCount) * 10) / 10,
      key: item.key,
      name: item.name,
      reviewCount: item.reviewCount
    }))
    .sort((a, b) => b.averageRating - a.averageRating || b.reviewCount - a.reviewCount)
    .slice(0, 5);

  const dayBuckets = [];

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(now.getTime() - index * DAY_MS);
    const key = getDateKey(date);

    dayBuckets.push({
      count: 0,
      key,
      label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      totalCents: 0
    });
  }

  const bucketByKey = new Map(dayBuckets.map((bucket) => [bucket.key, bucket]));

  for (const order of salesOrders) {
    const bucket = bucketByKey.get(getDateKey(order.created_at));

    if (!bucket) {
      continue;
    }

    bucket.count += 1;
    bucket.totalCents += order.total_cents ?? 0;
  }

  const maxDailyRevenueCents = Math.max(1, ...dayBuckets.map((bucket) => bucket.totalCents));

  return {
    activeOrderCount: activeOrders.length,
    averageTicketCents,
    dailySales: dayBuckets.map((bucket) => ({
      ...bucket,
      percentage: Math.round((bucket.totalCents / maxDailyRevenueCents) * 100)
    })),
    grossProfitCents,
    internalStatusCounts,
    knownCostCents,
    salesCount: salesOrders.length,
    topRatedItems,
    topSoldItems,
    topCustomers,
    totalOrderCount: orders.length,
    totalRevenueCents
  };
}
