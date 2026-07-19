export async function claimUnownedOrder({ orderId, supabase, userId }) {
  const { data, error } = await supabase
    .from("orders")
    .update({ user_id: userId })
    .eq("id", orderId)
    .is("user_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}
