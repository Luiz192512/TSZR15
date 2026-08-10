# Fechar colunas internas expostas ao cliente via PostgREST

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que um cliente autenticado leia colunas internas dos próprios pedidos — custo por item, notas internas, operador designado — através de requisição direta ao PostgREST.

**Architecture:** As tabelas têm RLS ligada, mas as policies filtram **linha**, não coluna, e os grants são de **tabela inteira** para `anon` e `authenticated`. A correção é revogar o grant amplo e conceder apenas o necessário. Como nenhum código do navegador lê essas tabelas — toda leitura do app passa por `createServiceRoleSupabaseClient()`, que ignora RLS e grants — a revogação não afeta a aplicação.

**Tech Stack:** Supabase (Postgres 17 + PostgREST), `node:test`.

## Global Constraints

- **Migration ANTES do código.** Aqui não há código dependente, mas a ordem de aplicação em produção continua sendo decisão e ação do dono.
- **Não remover as policies de RLS.** Elas viram defesa em profundidade: se alguém reconceder um grant no futuro, a policy ainda limita as linhas.
- **Não tocar em `service_role`.** Todo o app depende dele para ler essas tabelas.
- **Toda verificação em produção é leitura.** Nenhum `INSERT`/`UPDATE`/`DELETE` de dado.

---

## Decisão do dono antes de executar

Duas saídas. Precisa da sua escolha porque mudam o que fica possível no futuro.

**Opção A — revogar `SELECT` de `anon` e `authenticated` por completo (recomendada).**
Nada no app usa esse caminho: as leituras de `orders`, `order_items` e `payments` acontecem em `src/reviews/order-reviews.js`, `src/reviews/order-claim.js` e `src/tracking/order-tracking.js`, todas com service role. Nenhum componente `"use client"` consulta essas tabelas — verifiquei os quatro que criam cliente de browser (`account-nav-link.js`, `cart-checkout.js`, `use-cart.js`, `auth-hash-bridge.js`).
Vantagem decisiva: **falha fechada por padrão**. Coluna nova criada amanhã já nasce inacessível ao cliente. O modo de falha que produziu este bug — esquecer de excluir uma coluna — deixa de existir. É o padrão que `catalog_product_costs` já segue (zero colunas concedidas).
Custo: se um dia você quiser ler pedidos direto do navegador, terá que reconceder colunas explicitamente ou passar por rota de servidor.

**Opção B — grant por coluna, mantendo o cliente capaz de ler as colunas seguras.**
Preserva a intenção aparente do design atual. Custo: toda coluna nova precisa ser lembrada na lista, e esquecer significa vazar de novo. Foi exatamente assim que chegamos aqui.

O plano abaixo implementa a **Opção A**. Se você escolher a B, o Step 3 da Task 1 troca de `revoke` para `revoke` + `grant select (lista)`, e o resto segue igual.

---

## Evidência do problema

Levantado contra o banco de produção `mckthvbwddxipghumrpw` em 2026-08-07:

```sql
-- policies: filtram linha, nao coluna
Customers can view own orders       | SELECT | {authenticated} | auth.uid() = user_id
Customers can view own order items  | SELECT | {authenticated} | EXISTS (... orders.user_id = auth.uid())
Customers can view own payments     | SELECT | {authenticated} | EXISTS (... orders.user_id = auth.uid())
```

```
tabela                    | colunas SELECT p/ authenticated | policy SELECT? | vaza
orders                    | 35                              | sim            | SIM
order_items               | 19                              | sim            | SIM
payments                  | 11                              | sim            | SIM
supplier_purchases        | 20                              | nao            | nao
supplier_tracking_events  |  9                              | nao            | nao
audit_logs                |  7                              | nao            | nao
support_threads           |  8                              | nao            | nao
catalog_product_costs     |  0                              | -              | nao (padrao correto)
```

Colunas internas hoje legíveis pelo cliente no próprio pedido:

- `orders`: `internal_notes`, `assigned_operator`, `customer_snapshot`, `consent_snapshot`, `discount_snapshot`, `original_message`, `source_visibility`
- `order_items`: **`unit_cost_cents`, `subtotal_cost_cents`** — permitem calcular a margem da loja por item
- `payments`: `provider`, `provider_reference`, `paid_at`

As três tabelas sem policy (`supplier_purchases` e companhia) não vazam porque RLS ligada sem policy permissiva nega por padrão — o grant sozinho não basta. Ficam mesmo assim no escopo da revogação, por higiene: se alguém adicionar uma policy amanhã, o grant amplo transformaria isso em vazamento no mesmo instante.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
| --- | --- | --- |
| `supabase/migrations/20260807210000_revoke_internal_column_grants.sql` | Revoga os grants amplos das tabelas operacionais | Criar |
| `tests/rls-column-exposure.test.mjs` | Trava o conteúdo da migration e documenta a consulta de verificação | Criar |

---

### Task 1: Migration revogando os grants amplos

**Files:**
- Create: `supabase/migrations/20260807210000_revoke_internal_column_grants.sql`
- Test: `tests/rls-column-exposure.test.mjs`

**Interfaces:**
- Consumes: nada
- Produces: `anon` e `authenticated` deixam de ter qualquer privilégio de `SELECT`/`INSERT`/`UPDATE`/`DELETE` em `orders`, `order_items`, `payments`, `supplier_purchases`, `supplier_tracking_events`, `audit_logs` e `support_threads`

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/rls-column-exposure.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260807210000_revoke_internal_column_grants.sql";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const tabelasOperacionais = [
  "orders",
  "order_items",
  "payments",
  "supplier_purchases",
  "supplier_tracking_events",
  "audit_logs",
  "support_threads"
];

test("migration revoga os grants amplos das tabelas operacionais", async () => {
  const migration = await source(migrationPath);

  for (const tabela of tabelasOperacionais) {
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${tabela} from anon, authenticated;`),
      `${tabela} sem revoke`
    );
  }
});

test("migration nao mexe em service_role nem remove as policies", async () => {
  const migration = await source(migrationPath);

  assert.doesNotMatch(
    migration,
    /revoke[\s\S]*from[^;]*service_role/i,
    "service_role e o unico caminho de leitura do app"
  );
  assert.doesNotMatch(
    migration,
    /drop policy/i,
    "as policies ficam como defesa em profundidade"
  );
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/rls-column-exposure.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory` ao ler a migration.

- [ ] **Step 3: Criar a migration**

Criar `supabase/migrations/20260807210000_revoke_internal_column_grants.sql`:

```sql
-- As policies de RLS filtram LINHA, nao COLUNA, e os grants eram de tabela
-- inteira para anon e authenticated. Resultado: um cliente logado conseguia
-- pedir qualquer coluna do proprio pedido direto no PostgREST, contornando as
-- projecoes explicitas da aplicacao — inclusive order_items.unit_cost_cents e
-- order_items.subtotal_cost_cents, que revelam a margem da loja, e
-- orders.internal_notes, onde o operador escreve observacoes internas.
--
-- Nenhum codigo do app depende desse caminho: todas as leituras dessas tabelas
-- usam createServiceRoleSupabaseClient(), que ignora RLS e grants, e nenhum
-- componente de navegador as consulta. Revogar tudo faz colunas novas nascerem
-- fechadas por padrao, que e o padrao ja adotado em catalog_product_costs.
--
-- As policies permanecem de proposito: se um grant for reintroduzido no futuro,
-- elas ainda limitam as linhas.
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.supplier_purchases from anon, authenticated;
revoke all on table public.supplier_tracking_events from anon, authenticated;
revoke all on table public.audit_logs from anon, authenticated;
revoke all on table public.support_threads from anon, authenticated;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/rls-column-exposure.test.mjs`
Expected: PASS — 2 testes.

- [ ] **Step 5: Rodar a suíte e o lint**

Run: `npm test && npm run lint`
Expected: verdes; a contagem sobe 2.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260807210000_revoke_internal_column_grants.sql tests/rls-column-exposure.test.mjs
git commit -m "fix(security): fecha colunas internas expostas ao cliente via PostgREST"
```

---

### Task 2: Consulta de verificação documentada

**Files:**
- Modify: `docs/ENVIRONMENT.md`
- Test: `tests/rls-column-exposure.test.mjs`

**Interfaces:**
- Consumes: a migration da Task 1
- Produces: consulta de auditoria versionada, para reconferir o estado a qualquer momento

A migration só vale se alguém souber reconferir depois — inclusive porque um `GRANT` amplo pode voltar por engano em qualquer alteração futura de schema.

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `tests/rls-column-exposure.test.mjs`:

```javascript
test("a consulta de auditoria de grants esta documentada", async () => {
  const doc = await source("docs/ENVIRONMENT.md");

  assert.match(doc, /information_schema\.column_privileges/);
  assert.match(doc, /grantee IN \('anon', 'authenticated'\)/);
  assert.match(doc, /Colunas internas expostas/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test tests/rls-column-exposure.test.mjs`
Expected: FAIL — a regex `information_schema.column_privileges` não casa.

- [ ] **Step 3: Documentar a consulta**

Acrescentar ao final de `docs/ENVIRONMENT.md`:

````markdown
## Colunas internas expostas ao cliente

As policies de RLS filtram linha, não coluna. Se um `GRANT` amplo voltar a
existir em uma tabela operacional que tenha policy de `SELECT` para
`authenticated`, o cliente volta a conseguir ler colunas internas do próprio
pedido — custo por item, notas internas, operador designado.

Para auditar, rode no SQL Editor do projeto:

```sql
SELECT cp.table_name, count(*) AS colunas_expostas
FROM information_schema.column_privileges cp
WHERE cp.table_schema = 'public'
  AND cp.grantee IN ('anon', 'authenticated')
  AND cp.privilege_type = 'SELECT'
  AND cp.table_name IN (
    'orders', 'order_items', 'payments', 'supplier_purchases',
    'supplier_tracking_events', 'audit_logs', 'support_threads'
  )
GROUP BY cp.table_name
ORDER BY cp.table_name;
```

O resultado esperado é **vazio**. Qualquer linha significa regressão: o app lê
essas tabelas por service role e não precisa desse acesso.
````

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test tests/rls-column-exposure.test.mjs`
Expected: PASS — 3 testes.

- [ ] **Step 5: Rodar a suíte e o lint**

Run: `npm test && npm run lint`
Expected: verdes.

- [ ] **Step 6: Commit**

```bash
git add docs/ENVIRONMENT.md tests/rls-column-exposure.test.mjs
git commit -m "docs: documenta a auditoria de colunas expostas ao cliente"
```

---

## Aplicação em produção (ação do dono)

1. Aplicar `supabase/migrations/20260807210000_revoke_internal_column_grants.sql` no projeto `mckthvbwddxipghumrpw`.
2. Rodar a consulta de auditoria da Task 2 e confirmar resultado **vazio**.
3. Verificar que a loja segue funcionando nos caminhos que leem pedidos:
   - `/conta` logado → lista de pedidos e avaliações carregam
   - `/rastreio` com número + contato → status aparece
   - checkout de um item → pedido é criado

Se algum quebrar, o `revoke` atingiu um caminho que eu não mapeei. O rollback é
imediato e reversível:

```sql
grant select on table public.orders to authenticated;
```

E aí o caso vira Opção B: descobrir qual coluna aquele caminho precisa e conceder
só ela.

## Fora de escopo

- **Auditoria de valores financeiros** (terceiro achado do Codex no PR #54): registrar valor anterior e novo dos ajustes e dos custos de fornecedor no `audit_logs`. Vale como plano próprio, cobrindo os dois de uma vez.
- **`anon` com grant de `INSERT`** nessas tabelas: a revogação acima já remove, mas o caminho de checkout de convidado depende de `create_checkout_order` com service role — se a chave não estiver configurada, o checkout já falha hoje por outro motivo (a RPC não é executável por `authenticated`, travado em teste desde o BUG-04). Confirmar no passo 3 da aplicação.
