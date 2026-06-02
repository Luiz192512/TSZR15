export const ASSISTED_PURCHASE_CONSENT_VERSION = "2026-05-20";

export const ASSISTED_PURCHASE_CONSENT_TEXT =
  "Autorizo a TSZR15 a usar meus dados de cadastro e entrega para atendimento, pagamento e cumprimento deste pedido TSZR15, inclusive na operacao interna de compra e envio.";

export function buildAddressLine(address) {
  if (!address) {
    return "";
  }

  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  const cityLine = [address.city, address.state].filter(Boolean).join("/");

  return [
    streetLine,
    address.district,
    cityLine,
    address.cep ? `CEP ${address.cep}` : "",
    address.complement,
    address.reference_point ? `Ref.: ${address.reference_point}` : ""
  ]
    .filter(Boolean)
    .join(" - ");
}

export function buildCustomerSnapshot({ address, profile, user }) {
  return {
    address: buildAddressLine(address),
    cep: address?.cep ?? "",
    email: profile?.email ?? user?.email ?? "",
    name: profile?.full_name ?? "",
    notes: "",
    phone: profile?.phone ?? "",
    taxId: profile?.tax_id ?? "",
    whatsapp: profile?.whatsapp ?? ""
  };
}

export async function getCurrentCustomerSnapshot(supabase) {
  if (!supabase) {
    return {
      address: null,
      customer: buildCustomerSnapshot({}),
      error: null,
      profile: null,
      supabaseConfigured: false,
      user: null
    };
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      address: null,
      customer: buildCustomerSnapshot({}),
      error: userError,
      profile: null,
      supabaseConfigured: true,
      user: null
    };
  }

  const [{ data: profile, error: profileError }, { data: addresses, error: addressError }] =
    await Promise.all([
      supabase.from("customer_profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("customer_addresses")
        .select("*")
        .eq("user_id", user.id)
        .order("is_default", { ascending: false })
        .order("updated_at", { ascending: false })
    ]);
  const addressList = addresses ?? [];
  const address = addressList.find((item) => item.is_default) ?? addressList[0] ?? null;

  return {
    address,
    addresses: addressList,
    customer: buildCustomerSnapshot({ address, profile, user }),
    error: profileError ?? addressError ?? null,
    profile,
    supabaseConfigured: true,
    user
  };
}
