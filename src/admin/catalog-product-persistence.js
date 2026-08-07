import { createAdminDatabaseError } from "./admin-action-error.js";

function throwCatalogProductError(error) {
  if (!error) {
    return;
  }

  if (error.code === "23505") {
    throw new Error("Ja existe um produto com este slug/ID.");
  }

  throw createAdminDatabaseError(error, "gravar produto do catalogo");
}

// RESTRICAO: a RPC save_admin_catalog_product apaga e reinsere TODAS as linhas
// de catalog_variation_stock do produto usando apenas variation/quantity do
// payload. Qualquer coluna futura nessa tabela (ex.: reserved do BUG-04) sera
// zerada por save de produto ate a RPC ser atualizada junto.
export async function saveAdminCatalogProductAggregate({
  costCents,
  persistenceMode,
  row,
  supabase,
  variationStock
}) {
  if (persistenceMode !== "create" && persistenceMode !== "update") {
    throw new Error("Modo de persistencia de produto invalido.");
  }

  const { data, error } = await supabase.rpc("save_admin_catalog_product", {
    p_cost_cents: Number.isInteger(costCents) ? costCents : null,
    p_persistence_mode: persistenceMode,
    p_product: row,
    p_variation_stock: variationStock
  });

  throwCatalogProductError(error);
  return data;
}
