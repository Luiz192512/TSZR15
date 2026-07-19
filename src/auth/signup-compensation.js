export async function rollbackCreatedCustomerAuthUser({ adminSupabase, userId }) {
  if (!adminSupabase || !userId) {
    return { error: new Error("Usuario de cadastro invalido para compensacao.") };
  }

  return adminSupabase.auth.admin.deleteUser(userId);
}
