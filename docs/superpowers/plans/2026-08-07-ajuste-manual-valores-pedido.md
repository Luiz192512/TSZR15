# Ajuste manual de valor pago e custo por pedido + análise sem truncagem

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o operador ajuste manualmente, depois de fechar a compra, o valor que o cliente efetivamente pagou e o custo total real de cada pedido, e fazer a análise do painel refletir esses valores sem truncar em 1000 pedidos.

**Architecture:** Duas colunas nullable em `orders` com semântica de *override* — `NULL` significa "sem ajuste" e a análise cai no valor derivado de hoje. A gravação passa pela RPC transacional já existente (`save_admin_order_operation`), preservando a atomicidade conquistada no BUG-04. A truncagem sai por **paginação da leitura**, não por reescrita da agregação em SQL: a função pura `buildAdminOrderAnalytics` já é testada e move rankings, buckets diários e fallbacks de custo — reimplementar isso em SQL trocaria cobertura de teste por risco de migration sem ganho proporcional numa base de 2 pedidos.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres 17 + PostgREST), `node:test`, ESLint.

## Global Constraints

- **Migration ANTES do código que depende dela.** O projeto tem 3 incidentes registrados de código em produção chamando estrutura inexistente. A migration desta feature é aditiva (colunas nullable + `CREATE OR REPLACE`), mas a ordem continua obrigatória.
- **Nenhum `select("*")` em `src/admin/order-admin.js`.** O teste `tests/audit-config.test.mjs` falha se reaparecer. Colunas novas entram nas listas explícitas.
- **Erro de driver nunca vai cru ao usuário.** Toda propagação em `src/admin/` usa `createAdminDatabaseError`; `tests/admin-action-error.test.mjs` falha se reaparecer `throw new Error(error.message)`.
- **O cliente não vê os valores ajustados.** `/conta` e `/rastreio` continuam exibindo `orders.total_cents`. Os campos `settled_*` são internos.
- **Valores em centavos, inteiros, não negativos.** O painel já converte com `parseAdminMoneyToCents` (aceita `199,90`, `199.90`, `2.490,00`).
- **Migration aplicada em produção é ação do dono**, não do agente. O passo final do plano é uma instrução, não uma execução.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
| --- | --- | --- |
| `supabase/migrations/20260807190000_admin_settled_order_values.sql` | Colunas `settled_total_cents` / `settled_cost_cents` + RPC gravando-as | Criar |
| `src/admin/order-analytics.js` | Precedência dos valores ajustados nos agregados | Modificar |
| `src/admin/order-admin.js` | Leitura paginada (sem teto) + colunas novas nos selects | Modificar |
| `src/admin/order-operation.js` | Coleta dos dois campos do formulário para os args da RPC | Modificar |
| `app/admin/_components/admin-orders-view.js` | Campos no formulário + leitura do valor efetivo | Modificar |
| `tests/admin-order-analytics.test.mjs` | Precedência dos ajustes nos agregados | Modificar |
| `tests/admin-settled-values.test.mjs` | Migration, args da RPC e formulário | Criar |

---

### Task 1: Migration — colunas de ajuste e RPC

**Files:**
- Create: `supabase/migrations/20260807190000_admin_settled_order_values.sql`
- Test: `tests/admin-settled-values.test.mjs`

**Interfaces:**
- Consumes: nada (primeira tarefa)
- Produces: colunas `public.orders.settled_total_cents` e `public.orders.settled_cost_cents` (`integer`, nullable, `>= 0`); a RPC `save_admin_order_operation` passa a ler `p_order ->> 'settledTotalCents'` e `p_order ->> 'settledCostCents'` (strings de centavos ou vazio/ausente para limpar o ajuste)

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/admin-settled-values.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const migrationPath =
  "supabase/migrations/20260807190000_admin_settled_order_values.sql";

test("migration adiciona as colunas de ajuste como override nullable", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /add column if not exists settled_total_cents integer/);
  assert.match(migration, /add column if not exists settled_cost_cents integer/);
  assert.match(migration, /settled_total_cents is null or settled_total_cents >= 0/);
  assert.match(migration, /settled_cost_cents is null or settled_cost_cents >= 0/);

  // Escopo no bloco de ALTER: o corpo da RPC copiado adiante contem "is not null"
  // em varias checagens plpgsql, entao varrer o arquivo inteiro daria falso positivo.
  const alterBlock = migration.slice(0, migration.indexOf("create or replace function"));

  assert.doesNotMatch(
    alterBlock,
    /settled_(total|cost)_cents integer[^;]*\bnot null\b/i,
    "as colunas precisam aceitar NULL = sem ajuste"
  );
});

test("RPC grava os dois ajustes e limpa quando o campo vem vazio", async () => {
  const migration = await source(migrationPath);

  assert.match(migration, /create or replace function public\.save_admin_order_operation/);
  assert.match(
    migration,
    /settled_total_cents = nullif\(p_order ->> 'settledTotalCents', ''\)::integer/
  );
  assert.match(
    migration,
    /settled_cost_cents = nullif\(p_order ->> 'settledCostCents', ''\)::integer/
  );
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/admin-settled-values.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory` ao ler a migration.

- [ ] **Step 3: Criar a migration com as colunas**

Criar `supabase/migrations/20260807190000_admin_settled_order_values.sql` começando por:

```sql
-- Ajuste manual pos-venda. O valor que o cliente efetivamente paga e o custo
-- real do pedido variam na hora da compra, entao o operador corrige os dois no
-- painel depois de fechar. As colunas sao override: NULL significa "sem
-- ajuste", e a analise cai no valor derivado de hoje (total_cents para receita,
-- soma de supplier_purchases para custo). O cliente continua vendo total_cents.
alter table public.orders
  add column if not exists settled_total_cents integer
    constraint orders_settled_total_cents_non_negative
    check (settled_total_cents is null or settled_total_cents >= 0);

alter table public.orders
  add column if not exists settled_cost_cents integer
    constraint orders_settled_cost_cents_non_negative
    check (settled_cost_cents is null or settled_cost_cents >= 0);

comment on column public.orders.settled_total_cents is
  'Valor efetivamente recebido, ajustado no painel admin. NULL usa total_cents.';
comment on column public.orders.settled_cost_cents is
  'Custo total real do pedido, ajustado no painel admin. NULL usa a soma de supplier_purchases.';
```

- [ ] **Step 4: Anexar a RPC atualizada na mesma migration**

A função vigente está em `supabase/migrations/20260720130000_stock_reservation_hardening.sql`, **linhas 320 a 551** (de `create or replace function public.save_admin_order_operation(` até o `$$;` que a fecha). Copie esse bloco inteiro para o final da nova migration, sem alterar assinatura, `security invoker`, `set search_path = ''` nem a lógica de estoque.

Aplique **uma única mudança**, no `update public.orders` (linha 394 do arquivo de origem). Antes:

```sql
  update public.orders
  set
    assigned_operator = nullif(p_order ->> 'assignedOperator', ''),
    internal_notes = nullif(p_order ->> 'internalNotes', ''),
    operational_status = v_operational_status,
    payment_status = v_payment_status
  where orders.id = p_order_id;
```

Depois:

```sql
  update public.orders
  set
    assigned_operator = nullif(p_order ->> 'assignedOperator', ''),
    internal_notes = nullif(p_order ->> 'internalNotes', ''),
    operational_status = v_operational_status,
    payment_status = v_payment_status,
    settled_total_cents = nullif(p_order ->> 'settledTotalCents', '')::integer,
    settled_cost_cents = nullif(p_order ->> 'settledCostCents', '')::integer
  where orders.id = p_order_id;
```

Chave ausente e string vazia caem os dois em `NULL`, então limpar o campo no formulário remove o ajuste — que é o comportamento desejado.

**Não** copie blocos `revoke` / `grant`. `CREATE OR REPLACE FUNCTION` preserva o ACL existente no Postgres, e a própria migration `20260720130000_stock_reservation_hardening.sql` recria essa função sem re-conceder nada — é o precedente do repositório. Re-executar os `grant` só adicionaria ruído e risco de divergir das permissões atuais.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test tests/admin-settled-values.test.mjs`
Expected: PASS — 2 testes.

- [ ] **Step 6: Rodar a suíte inteira e o lint**

Run: `npm test && npm run lint`
Expected: todos verdes; a contagem sobe 2 em relação ao baseline.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260807190000_admin_settled_order_values.sql tests/admin-settled-values.test.mjs
git commit -m "feat(admin): adiciona colunas de ajuste de valor pago e custo do pedido"
```

---

### Task 2: Precedência dos ajustes na análise

**Files:**
- Modify: `src/admin/order-analytics.js:62`, `:63-65`, `:94`, `:180`
- Test: `tests/admin-order-analytics.test.mjs`

**Interfaces:**
- Consumes: linhas de `orders` com os campos opcionais `settled_total_cents` e `settled_cost_cents` (Task 1)
- Produces: `buildAdminOrderAnalytics` mantém a mesma assinatura e o mesmo formato de retorno; muda só o valor de `totalRevenueCents`, `knownCostCents`, `grossProfitCents`, `averageTicketCents`, `topCustomers[].totalCents` e `dailySales[].totalCents` quando os ajustes estão preenchidos

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar ao final de `tests/admin-order-analytics.test.mjs`:

```javascript
test("valores ajustados no pedido tem precedencia sobre total e custo derivados", () => {
  const orders = [
    {
      id: "ajustado",
      created_at: "2026-07-11T13:00:00.000Z",
      customer_name: "Ajustado",
      internal_order_status: "confirmado",
      operational_status: "pagamento_confirmado",
      payment_status: "pagamento_confirmado",
      settled_cost_cents: 4000,
      settled_total_cents: 18000,
      total_cents: 20000,
    },
    {
      id: "sem-ajuste",
      created_at: "2026-07-11T14:00:00.000Z",
      customer_name: "Sem ajuste",
      internal_order_status: "confirmado",
      operational_status: "pagamento_confirmado",
      payment_status: "pagamento_confirmado",
      settled_cost_cents: null,
      settled_total_cents: null,
      total_cents: 10000,
    },
  ];
  const supplierPurchases = [
    { order_id: "ajustado", product_cost_cents: 9999, shipping_cost_cents: 9999 },
    { order_id: "sem-ajuste", product_cost_cents: 3000, shipping_cost_cents: 500 },
  ];

  const analytics = buildAdminOrderAnalytics({
    now: new Date("2026-07-12T12:00:00.000Z"),
    orders,
    supplierPurchases,
  });

  // 18000 (ajustado) + 10000 (derivado) — o total_cents de 20000 e ignorado.
  assert.equal(analytics.totalRevenueCents, 28000);
  // 4000 (ajustado) + 3500 (produto+frete) — o custo de fornecedor e ignorado.
  assert.equal(analytics.knownCostCents, 7500);
  assert.equal(analytics.grossProfitCents, 20500);
  assert.equal(analytics.averageTicketCents, 14000);
  assert.equal(
    analytics.topCustomers.find((customer) => customer.name === "Ajustado").totalCents,
    18000
  );
  assert.equal(
    analytics.dailySales.reduce((total, bucket) => total + bucket.totalCents, 0),
    28000
  );
});

test("ajuste zerado e respeitado e nao cai no fallback", () => {
  const analytics = buildAdminOrderAnalytics({
    now: new Date("2026-07-12T12:00:00.000Z"),
    orders: [
      {
        id: "cortesia",
        created_at: "2026-07-11T13:00:00.000Z",
        customer_name: "Cortesia",
        internal_order_status: "confirmado",
        operational_status: "pagamento_confirmado",
        payment_status: "pagamento_confirmado",
        settled_cost_cents: 0,
        settled_total_cents: 0,
        total_cents: 15000,
      },
    ],
    supplierPurchases: [
      { order_id: "cortesia", product_cost_cents: 7000, shipping_cost_cents: 0 },
    ],
  });

  assert.equal(analytics.totalRevenueCents, 0);
  assert.equal(analytics.knownCostCents, 0);
});
```

O segundo teste é o que exige `Number.isInteger` em vez de `??`: com `??`, `0` passaria, mas com `||` cairia no fallback. Ele trava a escolha do operador.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/admin-order-analytics.test.mjs`
Expected: FAIL no primeiro teste novo — `totalRevenueCents` vem `30000` (soma de `total_cents`) em vez de `28000`.

- [ ] **Step 3: Adicionar os helpers de valor efetivo**

Em `src/admin/order-analytics.js`, logo após `function isSalesOrder(order)` (linha 28), inserir:

```javascript
// Ajuste manual do painel tem precedencia sobre o valor derivado. Number.isInteger
// em vez de ?? porque 0 e um ajuste valido (pedido cortesia, custo absorvido).
function getEffectiveTotalCents(order) {
  return Number.isInteger(order.settled_total_cents)
    ? order.settled_total_cents
    : order.total_cents ?? 0;
}

function getEffectiveCostCents(order, costsByOrderId, itemCostsByOrderId) {
  if (Number.isInteger(order.settled_cost_cents)) {
    return order.settled_cost_cents;
  }

  return costsByOrderId.get(order.id) ?? itemCostsByOrderId.get(order.id) ?? 0;
}
```

- [ ] **Step 4: Trocar os quatro pontos de leitura**

Em `src/admin/order-analytics.js`, linha 62, trocar:

```javascript
  const totalRevenueCents = sumCents(salesOrders.map((order) => order.total_cents));
  const knownCostCents = sumCents(
    salesOrders.map((order) => costsByOrderId.get(order.id) ?? itemCostsByOrderId.get(order.id) ?? 0)
  );
```

por:

```javascript
  const totalRevenueCents = sumCents(salesOrders.map(getEffectiveTotalCents));
  const knownCostCents = sumCents(
    salesOrders.map((order) => getEffectiveCostCents(order, costsByOrderId, itemCostsByOrderId))
  );
```

Na linha 94, trocar `previous.totalCents += order.total_cents ?? 0;` por:

```javascript
    previous.totalCents += getEffectiveTotalCents(order);
```

Na linha 180, trocar `bucket.totalCents += order.total_cents ?? 0;` por:

```javascript
    bucket.totalCents += getEffectiveTotalCents(order);
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `node --test tests/admin-order-analytics.test.mjs`
Expected: PASS — os testes antigos continuam válidos porque nenhum deles define `settled_*`.

- [ ] **Step 6: Commit**

```bash
git add src/admin/order-analytics.js tests/admin-order-analytics.test.mjs
git commit -m "feat(admin): analise usa valor pago e custo ajustados quando preenchidos"
```

---

### Task 3: Leitura paginada — fim da truncagem em 1000

**Files:**
- Modify: `src/admin/order-admin.js` (constante de colunas da análise e `getAdminOrderAnalytics`)
- Test: `tests/admin-settled-values.test.mjs`

**Interfaces:**
- Consumes: colunas `settled_*` (Task 1); helpers de precedência (Task 2)
- Produces: `getAdminOrderAnalytics({ supabase })` passa a ler **todos** os pedidos em páginas de 1000; assinatura e retorno inalterados

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/admin-settled-values.test.mjs`:

```javascript
test("analise le todos os pedidos em paginas, sem teto silencioso", async () => {
  const orderAdmin = await source("src/admin/order-admin.js");
  const loader =
    orderAdmin.match(/export async function getAdminOrderAnalytics[\s\S]*?\n\}/)?.[0] ?? "";

  assert.notEqual(loader, "", "getAdminOrderAnalytics nao encontrado");
  assert.doesNotMatch(loader, /\.limit\(1000\)/, "teto fixo de 1000 reintroduzido");
  assert.match(loader, /\.range\(/, "a leitura precisa paginar por range");
  assert.match(loader, /settled_total_cents/);
  assert.match(loader, /settled_cost_cents/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/admin-settled-values.test.mjs`
Expected: FAIL — "teto fixo de 1000 reintroduzido".

- [ ] **Step 3: Extrair a constante de colunas e o tamanho de página**

Em `src/admin/order-admin.js`, junto das outras constantes de coluna (após `adminTrackingEventColumns`), inserir:

```javascript
const adminAnalyticsOrderColumns = [
  "id",
  "customer_name",
  "customer_email",
  "customer_whatsapp",
  "total_cents",
  "settled_total_cents",
  "settled_cost_cents",
  "payment_status",
  "operational_status",
  "internal_order_status",
  "created_at"
].join(",");
// Paginacao da analise: o teto anterior de 1000 truncava em silencio e os
// agregados de vida inteira passavam a mentir a partir do pedido 1001.
const adminAnalyticsPageSize = 1000;
```

- [ ] **Step 4: Trocar a consulta única pela leitura paginada**

Em `src/admin/order-admin.js`, dentro de `getAdminOrderAnalytics`, trocar:

```javascript
  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, customer_name, customer_email, customer_whatsapp, total_cents, payment_status, operational_status, internal_order_status, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  if (orderError) {
    throw createAdminDatabaseError(orderError, "carregar analytics de pedidos");
  }
```

por:

```javascript
  const orders = [];

  for (let page = 0; ; page += 1) {
    const from = page * adminAnalyticsPageSize;
    const { data, error: orderError } = await supabase
      .from("orders")
      .select(adminAnalyticsOrderColumns)
      .order("created_at", { ascending: false })
      .range(from, from + adminAnalyticsPageSize - 1);

    if (orderError) {
      throw createAdminDatabaseError(orderError, "carregar analytics de pedidos");
    }

    const rows = data ?? [];
    orders.push(...rows);

    if (rows.length < adminAnalyticsPageSize) {
      break;
    }
  }
```

O laço encerra na primeira página incompleta, então uma base com 2 pedidos faz exatamente 1 consulta — igual a hoje.

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `node --test tests/admin-settled-values.test.mjs tests/audit-config.test.mjs`
Expected: PASS nos dois arquivos. O `audit-config` confirma que nenhum `select("*")` entrou junto.

- [ ] **Step 6: Rodar a suíte, o lint e o build**

Run: `npm test && npm run lint && npm run build`
Expected: todos verdes.

- [ ] **Step 7: Commit**

```bash
git add src/admin/order-admin.js tests/admin-settled-values.test.mjs
git commit -m "perf(admin): pagina a leitura da analise e remove o teto de 1000 pedidos"
```

---

### Task 4: Campos no formulário e envio para a RPC

**Files:**
- Modify: `src/admin/order-operation.js` (bloco `p_order` de `buildAdminOrderOperationRpcArgs`)
- Modify: `app/admin/_components/admin-orders-view.js` (bloco "Status do pedido" do `OrderDetail`)
- Modify: `src/admin/order-admin.js` (`adminOrderDetailColumns`)
- Test: `tests/admin-settled-values.test.mjs`

**Interfaces:**
- Consumes: chaves `settledTotalCents` / `settledCostCents` aceitas pela RPC (Task 1)
- Produces: campos de formulário `settledTotal` e `settledCost`, convertidos por `parseAdminMoneyToCents` e enviados como string de centavos (ou `""` para limpar)

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/admin-settled-values.test.mjs`:

```javascript
test("args da RPC carregam os dois ajustes em centavos", async () => {
  const { buildAdminOrderOperationRpcArgs } = await import(
    "../src/admin/order-operation.js"
  );
  const formData = new FormData();

  // operationId passa por regex de UUID com nibbles de versao [1-8] e variante
  // [89ab]; "enviado" nao existe em operationalStatuses (o valor real e
  // "em_transito"). Os dois fixtures foram validados contra o modulo real.
  formData.set("orderId", "11111111-1111-4111-8111-111111111111");
  formData.set("orderNumber", "TSZ-1");
  formData.set("operationId", "22222222-2222-4222-8222-222222222222");
  formData.set("paymentStatus", "pagamento_confirmado");
  formData.set("operationalStatus", "em_transito");
  formData.set("settledTotal", "189,90");
  formData.set("settledCost", "40,00");

  const args = buildAdminOrderOperationRpcArgs(formData);

  assert.equal(args.p_order.settledTotalCents, "18990");
  assert.equal(args.p_order.settledCostCents, "4000");
});

test("campo de ajuste vazio limpa o override em vez de virar zero", async () => {
  const { buildAdminOrderOperationRpcArgs } = await import(
    "../src/admin/order-operation.js"
  );
  const formData = new FormData();

  // operationId passa por regex de UUID com nibbles de versao [1-8] e variante
  // [89ab]; "enviado" nao existe em operationalStatuses (o valor real e
  // "em_transito"). Os dois fixtures foram validados contra o modulo real.
  formData.set("orderId", "11111111-1111-4111-8111-111111111111");
  formData.set("orderNumber", "TSZ-1");
  formData.set("operationId", "22222222-2222-4222-8222-222222222222");
  formData.set("paymentStatus", "pagamento_confirmado");
  formData.set("operationalStatus", "em_transito");
  formData.set("settledTotal", "");
  formData.set("settledCost", "");

  const args = buildAdminOrderOperationRpcArgs(formData);

  assert.equal(args.p_order.settledTotalCents, "");
  assert.equal(args.p_order.settledCostCents, "");
});

test("formulario do pedido expoe os dois campos de ajuste", async () => {
  const view = await source("app/admin/_components/admin-orders-view.js");

  assert.match(view, /name="settledTotal"/);
  assert.match(view, /name="settledCost"/);
  assert.match(view, /Valor efetivamente recebido/);
  assert.match(view, /Custo total real/);
});

test("colunas do pedido selecionado incluem os ajustes", async () => {
  const orderAdmin = await source("src/admin/order-admin.js");
  const columns =
    orderAdmin.match(/const adminOrderDetailColumns = \[[\s\S]*?\]\.join\(","\)/)?.[0] ?? "";

  assert.match(columns, /"settled_total_cents"/);
  assert.match(columns, /"settled_cost_cents"/);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test tests/admin-settled-values.test.mjs`
Expected: FAIL — `args.p_order.settledTotalCents` vem `undefined`.

- [ ] **Step 3: Enviar os ajustes nos args da RPC**

Em `src/admin/order-operation.js`, no objeto `p_order` do retorno de `buildAdminOrderOperationRpcArgs`, trocar:

```javascript
    p_order: {
      assignedOperator: cleanNullable(formData.get("assignedOperator"), 120),
      internalNotes: cleanNullable(formData.get("orderInternalNotes"), 1800),
      operationalStatus,
      paymentStatus,
    },
```

por:

```javascript
    p_order: {
      assignedOperator: cleanNullable(formData.get("assignedOperator"), 120),
      internalNotes: cleanNullable(formData.get("orderInternalNotes"), 1800),
      operationalStatus,
      paymentStatus,
      // String vazia limpa o override no banco (nullif no update da RPC).
      settledCostCents: toSettledCentsInput(formData.get("settledCost")),
      settledTotalCents: toSettledCentsInput(formData.get("settledTotal")),
    },
```

E adicionar, antes de `buildAdminOrderOperationRpcArgs`:

```javascript
// A RPC recebe centavos como texto: "" limpa o ajuste, numero grava o override.
function toSettledCentsInput(value) {
  const raw = cleanString(value, 40);

  if (!raw) {
    return "";
  }

  const cents = parseAdminMoneyToCents(raw, { allowZero: true });

  if (!Number.isInteger(cents)) {
    throw new Error("Informe um valor ajustado valido, como 189,90.");
  }

  return String(cents);
}
```

`parseAdminMoneyToCents` já está importado neste arquivo. `cleanString` também.

- [ ] **Step 4: Adicionar as colunas ao pedido selecionado**

Em `src/admin/order-admin.js`, na constante `adminOrderDetailColumns`, inserir `"settled_total_cents"` e `"settled_cost_cents"` logo após `"total_cents"`:

```javascript
  "total_cents",
  "settled_total_cents",
  "settled_cost_cents",
  "currency",
```

- [ ] **Step 5: Adicionar os campos ao formulário**

Em `app/admin/_components/admin-orders-view.js`, dentro do bloco `<h2>Status do pedido</h2>`, logo após o `<label>` de "Referencia do pagamento", inserir:

```jsx
            <label>
              <span>Valor efetivamente recebido</span>
              <input
                defaultValue={centsToInput(order.settled_total_cents)}
                inputMode="decimal"
                name="settledTotal"
                pattern="[0-9.,]+"
                placeholder={centsToInput(order.total_cents)}
                title="Use um valor como 189,90. Deixe vazio para usar o total do pedido."
              />
              <small>Deixe vazio para usar o total cobrado. So aparece no admin.</small>
            </label>
            <label>
              <span>Custo total real</span>
              <input
                defaultValue={centsToInput(order.settled_cost_cents)}
                inputMode="decimal"
                name="settledCost"
                pattern="[0-9.,]+"
                placeholder="0,00"
                title="Use um valor como 40,00. Deixe vazio para somar produto e frete."
              />
              <small>Deixe vazio para somar Custo produto + Custo frete abaixo.</small>
            </label>
```

`centsToInput` já está importado no arquivo (vem de `admin-ui.js`) e devolve `""` para `null`, então campo vazio = sem ajuste.

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `node --test tests/admin-settled-values.test.mjs`
Expected: PASS — 8 testes no arquivo.

- [ ] **Step 7: Rodar a suíte, o lint e o build**

Run: `npm test && npm run lint && npm run build`
Expected: todos verdes.

- [ ] **Step 8: Commit**

```bash
git add src/admin/order-operation.js src/admin/order-admin.js app/admin/_components/admin-orders-view.js tests/admin-settled-values.test.mjs
git commit -m "feat(admin): permite ajustar valor recebido e custo real no pedido"
```

---

### Task 5: Refletir o ajuste no cabeçalho do pedido

**Files:**
- Modify: `app/admin/_components/admin-orders-view.js` (`OrderDetail`, bloco `admin-total-box`)
- Test: `tests/admin-settled-values.test.mjs`

**Interfaces:**
- Consumes: `order.settled_total_cents` no objeto do pedido selecionado (Task 4)
- Produces: nenhuma interface nova

O operador precisa ver, ao abrir o pedido, se aquele valor já foi ajustado — senão o "Total cobrado" do topo contradiz a análise sem explicação.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/admin-settled-values.test.mjs`:

```javascript
test("cabecalho do pedido mostra o valor recebido quando ha ajuste", async () => {
  const view = await source("app/admin/_components/admin-orders-view.js");

  assert.match(view, /Number\.isInteger\(order\.settled_total_cents\)/);
  assert.match(view, /Valor recebido/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/admin-settled-values.test.mjs`
Expected: FAIL no teste novo.

- [ ] **Step 3: Trocar o bloco de total**

Em `app/admin/_components/admin-orders-view.js`, dentro de `OrderDetail`, trocar:

```jsx
        <div className={cx(globalStyles, "admin-total-box")}>
          <span>Total cobrado</span>
          <strong>{formatCurrency(order.total_cents, order.currency)}</strong>
        </div>
```

por:

```jsx
        <div className={cx(globalStyles, "admin-total-box")}>
          <span>{Number.isInteger(order.settled_total_cents) ? "Valor recebido" : "Total cobrado"}</span>
          <strong>
            {formatCurrency(
              Number.isInteger(order.settled_total_cents)
                ? order.settled_total_cents
                : order.total_cents,
              order.currency
            )}
          </strong>
          {Number.isInteger(order.settled_total_cents) ? (
            <small>Total cobrado: {formatCurrency(order.total_cents, order.currency)}</small>
          ) : null}
        </div>
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test tests/admin-settled-values.test.mjs`
Expected: PASS — 9 testes.

- [ ] **Step 5: Rodar a suíte, o lint e o build**

Run: `npm test && npm run lint && npm run build`
Expected: todos verdes.

- [ ] **Step 6: Commit**

```bash
git add app/admin/_components/admin-orders-view.js tests/admin-settled-values.test.mjs
git commit -m "feat(admin): destaca no pedido quando o valor recebido foi ajustado"
```

---

## Aplicação em produção (ação do dono, não do agente)

A migration **precisa ser aplicada antes** do código chegar em produção. O código lê e grava `settled_total_cents` / `settled_cost_cents`; se o deploy for primeiro, o painel quebra com `PGRST204` ("column not found in schema cache") — foi exatamente o modo de falha do incidente do PR #46.

Ordem correta:

1. Aplicar `supabase/migrations/20260807190000_admin_settled_order_values.sql` no projeto `mckthvbwddxipghumrpw`.
2. Conferir que as colunas existem e que a RPC foi recriada:

```sql
select column_name, is_nullable from information_schema.columns
where table_schema='public' and table_name='orders'
  and column_name in ('settled_total_cents','settled_cost_cents');
```

3. Só então mergear para `main` (o pipeline publica produção a partir de `main`).

Verificação manual pós-deploy, com um pedido real: preencher "Valor efetivamente recebido" com um valor diferente do total, salvar, e conferir que `/admin/analise` muda a "Receita confirmada" enquanto `/conta` do cliente segue mostrando o total original.

## Fora de escopo

- **FU-1 (painel cacheável):** fechado por decisão do dono, conforme recomendação. Nada a fazer.
- **Agregação em SQL:** a truncagem sai por paginação. Se a base passar de ~50k pedidos, aí sim vale mover os agregados para uma view — registrar como follow-up novo, não neste plano.
- **Exibir valor ajustado ao cliente:** decidido que não. `/conta` e `/rastreio` seguem com `total_cents`.
