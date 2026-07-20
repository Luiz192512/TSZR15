function throwCatalogProductError(error) {
  if (!error) {
    return;
  }

  if (error.code === "23505") {
    throw new Error("Ja existe um produto com este slug/ID.");
  }

  throw new Error(error.message);
}

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
