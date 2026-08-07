"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  claimCustomerOrder,
  submitOrderItemReview
} from "@/src/reviews/order-reviews.js";
import { getSafeActionErrorState } from "@/src/lib/action-error.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

async function getActionUser() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user ?? null;
}

function redirectWithError(message) {
  redirect(`/conta?error=${encodeURIComponent(message)}`);
}

// Mensagem de validacao segue intacta; detalhe de banco vira texto acionavel +
// referencia, com o original apenas no log do servidor.
function getAccountErrorMessage(error, fallbackMessage) {
  return getSafeActionErrorState(error, {
    event: "account_action_failed",
    fallbackMessage,
    prefix: "CON"
  }).message;
}

export async function claimCustomerOrderAction(formData) {
  const user = await getActionUser();

  if (!user) {
    redirect("/entrar?next=/conta");
  }

  try {
    await claimCustomerOrder({ formData, user });
    revalidatePath("/conta");
  } catch (error) {
    redirectWithError(
      getAccountErrorMessage(
        error,
        "Nao foi possivel vincular este pedido agora. Confira o numero do pedido e o contato usado na compra e tente de novo; se continuar, fale com o atendimento pelo WhatsApp informando a referencia abaixo."
      )
    );
  }

  redirect("/conta?status=pedido-vinculado");
}

export async function submitOrderItemReviewAction(formData) {
  const user = await getActionUser();

  if (!user) {
    redirect("/entrar?next=/conta");
  }

  try {
    await submitOrderItemReview({ formData, user });
    revalidatePath("/conta");
    revalidatePath("/admin", "layout");
  } catch (error) {
    redirectWithError(
      getAccountErrorMessage(
        error,
        "Nao foi possivel enviar sua avaliacao agora. Sua nota e seu comentario nao foram salvos; tente novamente em instantes e, se continuar, fale com o atendimento pelo WhatsApp informando a referencia abaixo."
      )
    );
  }

  redirect("/conta?status=avaliacao-enviada");
}
