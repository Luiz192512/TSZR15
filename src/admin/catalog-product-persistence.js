function throwCatalogProductError(error) {
  if (!error) {
    return;
  }

  if (error.code === "23505") {
    throw new Error("Ja existe um produto com este slug/ID.");
  }

  throw new Error(error.message);
}

export async function saveAdminCatalogProductRow({ persistenceMode, row, supabase }) {
  if (persistenceMode === "create") {
    const { error } = await supabase.from("catalog_products").insert(row);
    throwCatalogProductError(error);
    return;
  }

  if (persistenceMode === "update") {
    const { error } = await supabase
      .from("catalog_products")
      .upsert(row, { onConflict: "id" });
    throwCatalogProductError(error);
    return;
  }

  throw new Error("Modo de persistencia de produto invalido.");
}
