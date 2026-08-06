import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Next aplica headers de seguranca a paginas, APIs e assets", async () => {
  const { default: nextConfig } = await import("../next.config.mjs");

  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers();
  const globalRule = rules.find((rule) => rule.source === "/:path*");
  const headers = new Map(globalRule?.headers?.map(({ key, value }) => [key, value]));

  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.match(headers.get("Strict-Transport-Security") ?? "", /max-age=/);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.ok(headers.has("Referrer-Policy"));
  assert.ok(headers.has("Permissions-Policy"));
});

test("middleware nao autoriza cookie admin apenas pelo formato", async () => {
  const middleware = await source("middleware.js");

  assert.doesNotMatch(middleware, /isAdminSessionValueFreshShapeAtEdge/);
  assert.match(middleware, /if \(!hasSignedAdminSession\)/);
});

test("middleware nao consulta Supabase nas rotas publicas da vitrine", async () => {
  const middleware = await source("middleware.js");

  assert.doesNotMatch(middleware, /\/\(\(\?!api\|_next\/static/);
  assert.match(middleware, /"\/conta\/:path\*"/);
  assert.match(middleware, /"\/pedido\/:path\*"/);
  assert.match(middleware, /"\/admin\/:path\*"/);
});

test("logout admin exige origem valida e sessao assinada", async () => {
  const actions = await source("app/admin/actions.js");
  const signOutBody = actions.match(/export async function adminSignOutAction\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.match(actions, /isSameOriginRequest/);
  assert.match(signOutBody, /isAdminSessionValid/);
  assert.match(signOutBody, /clearAdminSession/);
});

test("OpenNext usa tag cache KV sem binding D1", async () => {
  const [openNext, production, preview] = await Promise.all([
    source("open-next.config.ts"),
    source("wrangler.jsonc"),
    source("wrangler.preview.jsonc")
  ]);

  assert.match(openNext, /kv-next-tag-cache/);
  assert.doesNotMatch(openNext, /d1-next-tag-cache/);

  for (const config of [production, preview]) {
    assert.match(config, /NEXT_TAG_CACHE_KV/);
    assert.doesNotMatch(config, /NEXT_TAG_CACHE_D1/);
  }
});

test("rotas ISR da vitrine usam TTL de uma hora", async () => {
  const files = await Promise.all([
    source("app/page.js"),
    source("app/catalogo/page.js"),
    source("app/produto/[slug]/page.js"),
    source("app/api/catalog/route.js")
  ]);

  for (const file of files) {
    assert.match(file, /export const revalidate = 3600;/);
  }
});

test("paginas dinamicas da vitrine reutilizam catalogo cacheado e invalidavel", async () => {
  const [catalog, revalidation] = await Promise.all([
    source("src/catalog/supabase-catalog.js"),
    source("src/catalog/revalidation.js")
  ]);

  assert.match(catalog, /unstable_cache/);
  assert.match(catalog, /revalidate:\s*3600/);
  assert.match(catalog, /tags:\s*\[STOREFRONT_CATALOG_CACHE_TAG\]/);
  assert.match(revalidation, /revalidateTag\(STOREFRONT_CATALOG_CACHE_TAG,\s*"max"\)/);
});

test("pagina de produto compartilha uma unica carga logica do catalogo", async () => {
  const productPage = await source("app/produto/[slug]/page.js");

  assert.match(productPage, /const getCatalog = cache/);
  assert.match(productPage, /getCatalog\(\)/);
  assert.equal((productPage.match(/getPublicCatalogProductsForStorefront\(\)/g) ?? []).length, 1);
});

test("componentes client nao importam o barrel com o seed legado", async () => {
  const files = await Promise.all([
    source("src/components/catalog/catalog-shared.js"),
    source("src/components/catalog/product-details.js")
  ]);

  for (const file of files) {
    assert.doesNotMatch(file, /src\/catalog\/index\.js/);
    assert.doesNotMatch(file, /src\/catalog\/products\.js/);
  }
});

test("grid da vitrine nao recebe o catalogo inteiro em componente client", async () => {
  const [home, catalogPage, hub, browser, productCard] = await Promise.all([
    source("app/page.js"),
    source("app/catalogo/page.js"),
    source("src/components/catalog/catalog-hub.js"),
    source("src/components/catalog/catalog-browser.js"),
    source("src/components/catalog/product-card.js")
  ]);

  assert.doesNotMatch(home, /<CatalogHub[\s\S]*products=\{catalog\.products\}/);
  assert.doesNotMatch(catalogPage, /<CatalogBrowser[\s\S]*products=\{catalog\.products\}/);
  assert.doesNotMatch(hub, /export function CatalogHub\([^)]*products/);
  assert.doesNotMatch(browser, /export function CatalogBrowser\([^)]*products/);
  assert.match(hub, /from "\.\/product-card\.js"/);
  assert.match(browser, /from "\.\/product-card\.js"/);
  assert.doesNotMatch(productCard, /["']use client["']/);
  assert.match(hub, /action="\/#produtos"/);
});

test("logger do Worker nao depende de pino ou transports Node", async () => {
  const [logger, packageJson] = await Promise.all([
    source("src/lib/logger.js"),
    source("package.json")
  ]);
  const manifest = JSON.parse(packageJson);

  assert.doesNotMatch(logger, /from "pino"/);
  assert.equal(manifest.dependencies?.pino, undefined);
});

test("estado do catalogo admin usa colunas explicitas e paginas limitadas", async () => {
  const adminCatalog = await source("src/admin/catalog-admin.js");
  const productsLoader =
    adminCatalog.match(/export async function getAdminProductsState[\s\S]*?\n\}/)?.[0] ?? "";
  const couponsLoader =
    adminCatalog.match(/export async function getAdminCouponsState[\s\S]*?\n\}/)?.[0] ?? "";

  assert.doesNotMatch(productsLoader, /\.select\("\*"\)/);
  assert.match(productsLoader, /\.range\(/);
  assert.match(productsLoader, /catalog_products/);
  assert.match(productsLoader, /productPagination\.page !== productPage/);

  assert.doesNotMatch(couponsLoader, /\.select\("\*"\)/);
  assert.match(couponsLoader, /\.range\(/);
  assert.match(couponsLoader, /catalog_coupons/);
  assert.match(couponsLoader, /catalog_products/);
  assert.match(couponsLoader, /couponPagination\.page !== couponPage/);
});

test("cada rota do admin carrega apenas o estado que renderiza", async () => {
  const [ordersPage, analyticsPage, productsPage, couponsPage] = await Promise.all([
    source("app/admin/pedidos/page.js"),
    source("app/admin/analise/page.js"),
    source("app/admin/produtos/page.js"),
    source("app/admin/cupons/page.js")
  ]);

  assert.match(ordersPage, /getAdminOrdersState/);
  assert.doesNotMatch(ordersPage, /getAdminAnalyticsState|getAdminCatalogState/);

  assert.match(analyticsPage, /getAdminAnalyticsState/);
  assert.doesNotMatch(analyticsPage, /getAdminOrdersState|listAdminOrders/);

  assert.match(productsPage, /getAdminProductsState/);
  assert.doesNotMatch(productsPage, /getAdminCouponsState/);

  assert.match(couponsPage, /getAdminCouponsState/);
  assert.doesNotMatch(couponsPage, /getAdminProductsState/);
});

test("todas as rotas do admin repetem o guard de sessao alem do layout", async () => {
  const routes = [
    "app/admin/layout.js",
    "app/admin/pedidos/page.js",
    "app/admin/analise/page.js",
    "app/admin/produtos/page.js",
    "app/admin/cupons/page.js"
  ];

  for (const route of routes) {
    const content = await source(route);

    assert.match(content, /isAdminSessionValid\(\)/, `${route} sem checagem de sessao`);
    assert.match(content, /isAdminTokenConfigured\(\)/, `${route} sem checagem de token`);
  }
});

test("API publica projeta cupom antes de responder", async () => {
  const [couponRoute, checkoutRoute] = await Promise.all([
    source("app/api/coupons/validate/route.js"),
    source("app/api/checkout/whatsapp/route.js")
  ]);

  assert.match(couponRoute, /toPublicCheckoutCoupon/);
  assert.match(checkoutRoute, /toPublicCheckoutCoupon/);
});

test("cadastro e troca de senha usam a politica compartilhada", async () => {
  const [actions, signUpPage, changePage] = await Promise.all([
    source("app/auth/actions.js"),
    source("app/cadastrar/page.js"),
    source("app/trocar-senha/page.js")
  ]);

  assert.match(actions, /getCustomerPasswordError/);
  assert.doesNotMatch(actions, /password\.length < 6/);
  assert.match(signUpPage, /MIN_CUSTOMER_PASSWORD_LENGTH/);
  assert.match(changePage, /MIN_CUSTOMER_PASSWORD_LENGTH/);
});

test("catalogo Supabase nao dispara consulta separada de estoque", async () => {
  const catalog = await source("src/catalog/supabase-catalog.js");

  assert.doesNotMatch(catalog, /readCatalogVariationStock/);
  assert.doesNotMatch(catalog, /attachVariationStock/);
});
