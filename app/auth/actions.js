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

import { logServerEvent } from "@/src/lib/logger.js";
import {
  consumeRateLimit,
  getRequestIp,
  rateLimitProfiles,
  resetRateLimit
} from "@/src/lib/rate-limit.js";
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

  redirect(`${path}${path.includes("?") ? "&" : "?"}${params.toString()}`);
}

function redirectWithStatus(path, status) {
  const params = new URLSearchParams({
    status
  });

  redirect(`${path}?${params.toString()}`);
}

async function getAdminRateLimitContext() {
  const headerStore = await headers();
  const identifier = `${getRequestIp(headerStore)}:admin`;

  return {
    identifier,
    supabase: createServiceRoleSupabaseClient()
  };
}

async function checkAdminLoginRateLimit() {
  const context = await getAdminRateLimitContext();
  const result = await consumeRateLimit({
    ...rateLimitProfiles.adminLogin,
    identifier: context.identifier,
    increment: false,
    supabase: context.supabase
  });

  if (!result.allowed) {
    logServerEvent("warn", "admin_login_rate_limit_blocked", {
      retryAfterSeconds: result.retryAfterSeconds,
      unavailable: result.unavailable
    });
  }

  return {
    ...context,
    result
  };
}

async function recordFailedAdminLogin({ identifier, supabase }) {
  const result = await consumeRateLimit({
    ...rateLimitProfiles.adminLogin,
    identifier,
    increment: true,
    supabase
  });

  logServerEvent("warn", "admin_login_failed", {
    retryAfterSeconds: result.retryAfterSeconds,
    unavailable: result.unavailable
  });

  return result;
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
    is_default: formData.get("addressIsDefault") === "on",
    label: formValue(formData, "addressLabel") || "Endereco",
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

function validateRequiredSignUp(formData) {
  const requiredFields = [
    ["fullName", "Informe o nome completo."],
    ["email", "Informe o email."],
    ["taxId", "Informe o CPF."],
    ["whatsapp", "Informe o numero de contato."]
  ];

  for (const [field, message] of requiredFields) {
    if (!formValue(formData, field)) {
      return message;
    }
  }

  const [formatError] = validateCustomerFieldFormats({
    phone: "",
    taxId: formValue(formData, "taxId"),
    whatsapp: formValue(formData, "whatsapp")
  });

  return formatError ?? null;
}

function validateRequiredAddress(formData) {
  const requiredFields = [
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

  const [formatError] = validateCustomerFieldFormats({
    cep: formValue(formData, "cep"),
    phone: "",
    state: formValue(formData, "state"),
    taxId: "",
    whatsapp: ""
  });

  return formatError ?? null;
}

function hasAddressFormData(formData) {
  return ["cep", "street", "number", "district", "city", "state"].some((field) =>
    formValue(formData, field)
  );
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

  const { error: profileError } = await persistenceSupabase
    .from("customer_profiles")
    .upsert(profilePayload, { onConflict: "user_id" });

  if (profileError) {
    return { error: profileError };
  }

  if (hasAddressFormData(formData)) {
    const addressPayload = {
      ...collectAddressPayload(formData, user),
      is_default: true
    };
    const { error: addressError } = await upsertDefaultAddress(persistenceSupabase, addressPayload);

    if (addressError) {
      return { error: addressError };
    }
  }

  if (formData.get("dataConsent") === "on") {
    const { error: consentError } = await insertConsent(persistenceSupabase, user.id);

    if (consentError) {
      return { error: consentError };
    }
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
    const rateLimitContext = await checkAdminLoginRateLimit();

    if (!rateLimitContext.result.allowed) {
      const message = rateLimitContext.result.unavailable
        ? "Protecao administrativa indisponivel. Tente novamente em instantes."
        : "Muitas tentativas administrativas. Aguarde alguns minutos antes de tentar de novo.";

      redirectWithError("/entrar", message, "/admin");
    }

    if (!isAdminTokenConfigured()) {
      logServerEvent("error", "admin_login_token_missing");
      redirectWithError(
        "/entrar",
        "Token administrativo ausente no servidor. Configure TSZR15_ADMIN_TOKEN no ambiente de producao.",
        "/admin"
      );
    }

    const isValidAdmin = await startAdminSession(password);

    if (!isValidAdmin) {
      const failedAttempt = await recordFailedAdminLogin(rateLimitContext);

      if (!failedAttempt.allowed) {
        redirectWithError(
          "/entrar",
          "Muitas tentativas administrativas. Aguarde alguns minutos antes de tentar de novo.",
          "/admin"
        );
      }

      redirectWithError("/entrar", "Senha administrativa invalida.", "/admin");
    }

    await resetRateLimit({
      ...rateLimitProfiles.adminLogin,
      identifier: rateLimitContext.identifier,
      supabase: rateLimitContext.supabase
    });
    logServerEvent("info", "admin_login_success");
    redirect("/admin");
  }

  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    const status = getSupabaseConfigStatus();
    const missing = status.missing.length ? ` Faltando: ${status.missing.join("; ")}.` : "";
    redirectWithError(
      "/entrar",
      `Configure as variaveis do Supabase antes de entrar.${missing}`,
      nextPath
    );
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

  const validationError = validateRequiredSignUp(formData);

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

export async function saveAccountProfileAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError("/conta?tab=dados", "Configure as variaveis do Supabase antes de salvar.");
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/entrar?next=/conta");
  }

  const requiredFields = [
    ["fullName", "Informe o nome completo."],
    ["email", "Informe o email."],
    ["taxId", "Informe o CPF/CNPJ."],
    ["whatsapp", "Informe o WhatsApp."]
  ];

  for (const [field, message] of requiredFields) {
    if (!formValue(formData, field)) {
      redirectWithError("/conta?tab=dados", message);
    }
  }

  const [formatError] = validateCustomerFieldFormats({
    phone: formValue(formData, "phone"),
    taxId: formValue(formData, "taxId"),
    whatsapp: formValue(formData, "whatsapp")
  });

  if (formatError) {
    redirectWithError("/conta?tab=dados", formatError);
  }

  const profilePayload = collectProfilePayload(formData, user);

  const { error: profileError } = await supabase
    .from("customer_profiles")
    .upsert(profilePayload, { onConflict: "user_id" });

  if (profileError) {
    redirectWithError("/conta?tab=dados", profileError.message);
  }

  revalidatePath("/", "layout");
  redirect("/conta?tab=dados&status=salvo");
}

export async function saveAccountAddressAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError(
      "/conta?tab=enderecos",
      "Configure as variaveis do Supabase antes de salvar."
    );
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/entrar?next=/conta");
  }

  const validationError = validateRequiredAddress(formData);

  if (validationError) {
    redirectWithError("/conta?tab=enderecos", validationError);
  }

  const addressId = formValue(formData, "addressId");
  const isFirstAddress = formData.get("isFirstAddress") === "true";
  const addressPayload = {
    ...collectAddressPayload(formData, user),
    is_default: formData.get("addressIsDefault") === "on" || isFirstAddress
  };

  if (addressPayload.is_default) {
    const { error: resetError } = await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("user_id", user.id);

    if (resetError) {
      redirectWithError("/conta?tab=enderecos", resetError.message);
    }
  }

  const addressRequest = addressId
    ? supabase.from("customer_addresses").update(addressPayload).eq("id", addressId)
    : supabase.from("customer_addresses").insert(addressPayload);
  const { error: addressError } = await addressRequest;

  if (addressError) {
    redirectWithError("/conta?tab=enderecos", addressError.message);
  }

  const { error: consentError } = await insertConsent(supabase, user.id);

  if (consentError) {
    redirectWithError("/conta?tab=enderecos", consentError.message);
  }

  revalidatePath("/", "layout");
  redirect("/conta?tab=enderecos&status=salvo");
}

export async function setDefaultAddressAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError(
      "/conta?tab=enderecos",
      "Configure as variaveis do Supabase antes de salvar."
    );
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/entrar?next=/conta");
  }

  const addressId = formValue(formData, "addressId");

  if (!addressId) {
    redirectWithError("/conta?tab=enderecos", "Endereco invalido.");
  }

  const { error: resetError } = await supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("user_id", user.id);

  if (resetError) {
    redirectWithError("/conta?tab=enderecos", resetError.message);
  }

  const { error } = await supabase
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", addressId)
    .eq("user_id", user.id);

  if (error) {
    redirectWithError("/conta?tab=enderecos", error.message);
  }

  revalidatePath("/", "layout");
  redirect("/conta?tab=enderecos&status=salvo");
}

export async function requestPasswordResetAction(formData) {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    redirectWithError(
      "/recuperar-senha",
      "Configure as variaveis do Supabase antes de recuperar senha."
    );
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
