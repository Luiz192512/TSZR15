"use server";

import { revalidatePath } from "next/cache";

import { validateCustomerFieldFormats } from "@/src/customer/field-validation.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

/**
 * Saves a new delivery address for the signed-in customer and returns the row.
 * Used by the checkout (cart) so a new address persists to the account without
 * navigating away. Returns { address } on success or { error } on failure.
 */
export async function saveCheckoutAddressAction(input) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return { error: "Configure o Supabase para salvar endereços." };
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Faça login para salvar o endereço." };
  }

  const payload = {
    cep: String(input?.cep ?? "").trim(),
    city: String(input?.city ?? "").trim(),
    complement: String(input?.complement ?? "").trim(),
    district: String(input?.district ?? "").trim(),
    label: String(input?.label ?? "").trim() || "Endereço",
    number: String(input?.number ?? "").trim(),
    reference_point: String(input?.referencePoint ?? "").trim(),
    state: String(input?.state ?? "").trim().toUpperCase(),
    street: String(input?.street ?? "").trim(),
    user_id: user.id
  };

  const requiredFields = [
    ["cep", "Informe o CEP."],
    ["street", "Informe a rua."],
    ["number", "Informe o número."],
    ["district", "Informe o bairro."],
    ["city", "Informe a cidade."],
    ["state", "Informe a UF."]
  ];

  for (const [field, message] of requiredFields) {
    if (!payload[field]) {
      return { error: message };
    }
  }

  const [formatError] = validateCustomerFieldFormats({
    cep: payload.cep,
    phone: "",
    state: payload.state,
    taxId: "",
    whatsapp: ""
  });

  if (formatError) {
    return { error: formatError };
  }

  const { error: resetError } = await supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("user_id", user.id);

  if (resetError) {
    return { error: resetError.message };
  }

  const { data: address, error } = await supabase
    .from("customer_addresses")
    .insert({ ...payload, is_default: true })
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/pedido");
  revalidatePath("/conta");

  return { address };
}
