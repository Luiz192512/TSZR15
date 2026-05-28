"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ASSISTED_PURCHASE_CONSENT_TEXT,
  ASSISTED_PURCHASE_CONSENT_VERSION
} from "@/src/customer/customer-data.js";
import { validateCustomerFieldFormats } from "@/src/customer/field-validation.js";
import { isAdminTokenConfigured, startAdminSession } from "@/src/admin/admin-auth.js";
import { getSafeAuthRedirectPath } from "@/src/auth/redirects.js";

import {
  buildPasswordResetRedirectUrl,
  getSiteOriginFromHeaders
} from "@/src/auth/password-reset.js";

import { createServiceRoleSupabaseClient } from "@/src/lib/supabase/admin.js";
import { getSupabaseConfigStatus } from "@/src/lib/supabase/config.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

function formValue(formData, key) {
  return String(formData.get(key) ?? "").trim();
}

function redirectWithError(path, message, nextPath = "") {
  const params = new URLSearchParams({
    error: message
  });
  const safeNextPath = nextPath ? getSafeAuthRedirectPath(nextPath) : "";

  if (safeNextPath) {
    params.set("next", safeNextPath);
  }

  redirect(`${path}?${params.toString()}`);
}

function redirectWithStatus(path, status) {
  const params = new URLSearchParams({
    status
  });

  redirect(`${path}?${params.toString()}`);
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

function collectSignUpMetadata(formData) {
  return {
    full_name: formValue(formData, "fullName"),
    phone: formValue(formData, "phone"),
    tax_id: formValue(formData, "taxId"),
    whatsapp: formValue(formData, "whatsapp")
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

  const [formatError] = validateCustomerFieldFormats({
    cep: formValue(formData, "cep"),
    phone: formValue(formData, "phone"),
    state: formValue(formData, "state"),
    taxId: formValue(formData, "taxId"),
    whatsapp: formValue(formData, "whatsapp")
  });

  if (formatError) {
    return formatError;
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

function isPersistableSignUpUser(user) {
  if (!user?.id) {
    return false;
  }

  return !Array.isArray(user.identities) || user.identities.length > 0;
}

async function upsertDefaultAddress(supabase, addressPayload) {
  const { data: existingAddress, error: lookupError } = await supabase
    .from("customer_addresses")
    .select("id")
    .eq("user_id", addressPayload.user_id)
    .eq("is_default", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return { error: lookupError };
  }

  if (existingAddress?.id) {
    return supabase.from("customer_addresses").update(addressPayload).eq("id", existingAddress.id);
  }

  return supabase.from("customer_addresses").insert(addressPayload);
}

async function persistSignUpCustomerData({ formData, hasSession, supabase, user }) {
  const persistenceSupabase = createServiceRoleSupabaseClient() ?? (hasSession ? supabase : null);

  if (!persistenceSupabase) {
    return {
      error: new Error(
        "Configure SUPABASE_SERVICE_ROLE_KEY para salvar dados de cadastro quando a confirmacao de email esta ativa."
      )
    };
  }

  const profilePayload = collectProfilePayload(formData, user);
  const addressPayload = collectAddressPayload(formData, user);

  const { error: profileError } = await persistenceSupabase
    .from("customer_profiles")
    .upsert(profilePayload, { onConflict: "user_id" });

  if (profileError) {
    return { error: profileError };
  }

  const { error: addressError } = await upsertDefaultAddress(persistenceSupabase, addressPayload);

  if (addressError) {
    return { error: addressError };
  }

  const { error: consentError } = await insertConsent(persistenceSupabase, user.id);

  if (consentError) {
    return { error: consentError };
  }

  return { error: null };
}

async function createConfirmedCustomerAccount({ email, formData, password, supabase }) {
  const adminSupabase = createServiceRoleSupabaseClient();

  if (!adminSupabase) {
    return { handled: false };
  }

  const { data, error } = await adminSupabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: collectSignUpMetadata(formData)
  });

  if (error) {
    return { handled: true, error };
  }

  const { error: persistenceError } = await persistSignUpCustomerData({
    formData,
    hasSession: true,
    supabase: adminSupabase,
    user: data.user
  });

  if (persistenceError) {
    return { handled: true, error: persistenceError };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    return { handled: true, error: signInError };
  }

  return { handled: true, error: null };
}

export async function signInAction(formData) {
  const email = formValue(formData, "email");
  const password = formValue(formData, "password");
  const nextPath = getSafeAuthRedirectPath(formValue(formData, "next"), "/conta");

  if (email.toLowerCase() === "admin") {
    if (!isAdminTokenConfigured()) {
      redirectWithError(
        "/entrar",
        "Token administrativo ausente no servidor. Configure TSZR15_ADMIN_TOKEN no ambiente de producao.",
        "/admin"
      );
    }

    const isValidAdmin = await startAdminSession(password);

    if (!isValidAdmin) {
      redirectWithError("/entrar", "Senha administrativa invalida.", "/admin");
    }

    redirect("/admin");
  }

  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    const status = getSupabaseConfigStatus();
    const missing = status.missing.length ? ` Faltando: ${status.missing.join("; ")}.` : "";
    redirectWithError("/entrar", `Configure as variaveis do Supabase antes de entrar.${missing}`, nextPath);
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirectWithError("/entrar", error.message, nextPath);
  }

  revalidatePath("/", "layout");
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

  const confirmedAccount = await createConfirmedCustomerAccount({
    email,
    formData,
    password,
    supabase
  });

  if (confirmedAccount.handled) {
    if (confirmedAccount.error) {
      redirectWithError("/cadastrar", confirmedAccount.error.message);
    }

    revalidatePath("/", "layout");
    redirect("/conta?status=cadastrado");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: collectSignUpMetadata(formData)
    }
  });

  if (error) {
    redirectWithError("/cadastrar", error.message);
  }

  if (isPersistableSignUpUser(data.user)) {
    const { error: persistenceError } = await persistSignUpCustomerData({
      formData,
      hasSession: Boolean(data.session),
      supabase,
      user: data.user
    });

    if (persistenceError) {
      redirectWithError("/cadastrar", persistenceError.message);
    }
  }

  if (data.session && data.user) {
    revalidatePath("/", "layout");
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

  revalidatePath("/", "layout");
  redirect("/conta?status=salvo");
}

export async function requestPasswordResetAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError("/recuperar-senha", "Configure as variaveis do Supabase antes de recuperar senha.");
  }

  const email = formValue(formData, "email").toLowerCase();

  if (!email) {
    redirectWithError("/recuperar-senha", "Informe o email da conta.");
  }

  const headerStore = await headers();
  const redirectTo = buildPasswordResetRedirectUrl(getSiteOriginFromHeaders(headerStore));
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) {
    redirectWithError("/recuperar-senha", error.message);
  }

  redirectWithStatus("/recuperar-senha", "enviado");
}

export async function updatePasswordAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError("/trocar-senha", "Configure as variaveis do Supabase antes de trocar senha.");
  }

  const password = formValue(formData, "password");
  const passwordConfirmation = formValue(formData, "passwordConfirmation");

  if (password.length < 6) {
    redirectWithError("/trocar-senha", "Use uma senha com pelo menos 6 caracteres.");
  }

  if (password !== passwordConfirmation) {
    redirectWithError("/trocar-senha", "As senhas informadas nao conferem.");
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirectWithError(
      "/recuperar-senha",
      "Abra o link de recuperacao enviado por email antes de definir uma nova senha."
    );
  }

  const { error } = await supabase.auth.updateUser({
    password
  });

  if (error) {
    redirectWithError("/trocar-senha", error.message);
  }

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirectWithStatus("/entrar", "senha-alterada");
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect("/");
}
