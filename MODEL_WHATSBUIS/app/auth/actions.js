"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  ASSISTED_PURCHASE_CONSENT_TEXT,
  ASSISTED_PURCHASE_CONSENT_VERSION
} from "@/src/customer/customer-data.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function formValue(formData, key) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithError(path, message) {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function collectProfilePayload(formData, user) {
  const email = formValue(formData, "email") || user?.email || "";

  return {
    email,
    full_name: formValue(formData, "fullName"),
    phone: formValue(formData, "phone"),
    tax_id: formValue(formData, "taxId"),
    user_id: user.id,
    whatsapp: formValue(formData, "whatsapp")
  };
}

function collectAddressPayload(formData, user) {
  return {
    cep: formValue(formData, "cep"),
    city: formValue(formData, "city"),
    complement: formValue(formData, "complement"),
    district: formValue(formData, "district"),
    is_default: true,
    label: "Principal",
    number: formValue(formData, "number"),
    reference_point: formValue(formData, "referencePoint"),
    state: formValue(formData, "state").toUpperCase(),
    street: formValue(formData, "street"),
    user_id: user.id
  };
}

function validateRequiredProfile(formData) {
  const requiredFields = [
    ["fullName", "Informe o nome completo."],
    ["email", "Informe o email."],
    ["whatsapp", "Informe o WhatsApp."],
    ["cep", "Informe o CEP."],
    ["street", "Informe a rua."],
    ["number", "Informe o numero."],
    ["district", "Informe o bairro."],
    ["city", "Informe a cidade."],
    ["state", "Informe a UF."]
  ];

  for (const [field, message] of requiredFields) {
    if (!formValue(formData, field)) {
      return message;
    }
  }

  if (formData.get("dataConsent") !== "on") {
    return "Confirme o consentimento de uso dos dados para compra assistida.";
  }

  return null;
}

async function insertConsent(supabase, userId) {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || null;

  return supabase.from("assisted_purchase_consents").insert({
    consent_text: ASSISTED_PURCHASE_CONSENT_TEXT,
    consent_version: ASSISTED_PURCHASE_CONSENT_VERSION,
    ip_address: ipAddress,
    purchase_data_use_authorized: true,
    user_agent: headerStore.get("user-agent"),
    user_id: userId
  });
}

export async function signInAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError("/entrar", "Configure as variaveis do Supabase antes de entrar.");
  }

  const email = formValue(formData, "email");
  const password = formValue(formData, "password");
  const nextPath = formValue(formData, "next") || "/conta";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirectWithError("/entrar", error.message);
  }

  redirect(nextPath);
}

export async function signUpAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError("/cadastrar", "Configure as variaveis do Supabase antes de cadastrar.");
  }

  const validationError = validateRequiredProfile(formData);

  if (validationError) {
    redirectWithError("/cadastrar", validationError);
  }

  const email = formValue(formData, "email");
  const password = formValue(formData, "password");

  if (password.length < 6) {
    redirectWithError("/cadastrar", "Use uma senha com pelo menos 6 caracteres.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: formValue(formData, "fullName"),
        phone: formValue(formData, "phone"),
        tax_id: formValue(formData, "taxId"),
        whatsapp: formValue(formData, "whatsapp")
      }
    }
  });

  if (error) {
    redirectWithError("/cadastrar", error.message);
  }

  if (data.session && data.user) {
    const profilePayload = collectProfilePayload(formData, data.user);
    const addressPayload = collectAddressPayload(formData, data.user);

    const { error: profileError } = await supabase
      .from("customer_profiles")
      .upsert(profilePayload, { onConflict: "user_id" });

    if (profileError) {
      redirectWithError("/cadastrar", profileError.message);
    }

    const { error: addressError } = await supabase
      .from("customer_addresses")
      .insert(addressPayload);

    if (addressError) {
      redirectWithError("/cadastrar", addressError.message);
    }

    const { error: consentError } = await insertConsent(supabase, data.user.id);

    if (consentError) {
      redirectWithError("/cadastrar", consentError.message);
    }

    redirect("/conta?status=cadastrado");
  }

  redirect("/entrar?status=confirmar-email");
}

export async function saveAccountAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError("/conta", "Configure as variaveis do Supabase antes de salvar.");
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/entrar?next=/conta");
  }

  const validationError = validateRequiredProfile(formData);

  if (validationError) {
    redirectWithError("/conta", validationError);
  }

  const profilePayload = collectProfilePayload(formData, user);
  const addressPayload = collectAddressPayload(formData, user);
  const addressId = formValue(formData, "addressId");

  const { error: profileError } = await supabase
    .from("customer_profiles")
    .upsert(profilePayload, { onConflict: "user_id" });

  if (profileError) {
    redirectWithError("/conta", profileError.message);
  }

  const addressRequest = addressId
    ? supabase.from("customer_addresses").update(addressPayload).eq("id", addressId)
    : supabase.from("customer_addresses").insert(addressPayload);
  const { error: addressError } = await addressRequest;

  if (addressError) {
    redirectWithError("/conta", addressError.message);
  }

  const { error: consentError } = await insertConsent(supabase, user.id);

  if (consentError) {
    redirectWithError("/conta", consentError.message);
  }

  redirect("/conta?status=salvo");
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/");
}
