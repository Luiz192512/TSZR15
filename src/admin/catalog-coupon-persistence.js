function throwCouponPersistenceError(error) {
  if (error?.code === "23505") {
    throw new Error("Ja existe um cupom com este codigo.");
  }

  throw new Error(error?.message || "Nao foi possivel salvar o cupom.");
}

export async function saveAdminCoupon({ couponId, row, supabase }) {
  const query = supabase.from("catalog_coupons");
  const { data, error } = couponId
    ? await query
        .update(row)
        .eq("id", couponId)
        .select("id, code")
        .maybeSingle()
    : await query.insert(row).select("id, code").single();

  if (error) {
    throwCouponPersistenceError(error);
  }

  if (!data) {
    throw new Error(
      "Cupom nao encontrado. Atualize o painel e tente novamente.",
    );
  }

  return data;
}

export async function archiveAdminCouponById({ couponId, supabase }) {
  if (!couponId) {
    throw new Error("Cupom invalido.");
  }

  const { data, error } = await supabase
    .from("catalog_coupons")
    .update({ is_active: false })
    .eq("id", couponId)
    .select("id, code")
    .maybeSingle();

  if (error) {
    throwCouponPersistenceError(error);
  }

  if (!data) {
    throw new Error(
      "Cupom nao encontrado. Atualize o painel e tente novamente.",
    );
  }

  return data;
}
