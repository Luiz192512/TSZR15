"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  claimCustomerOrder,
  submitOrderItemReview
} from "@/src/reviews/order-reviews.js";
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

export async function claimCustomerOrderAction(formData) {
  const user = await getActionUser();

  if (!user) {
    redirect("/entrar?next=/conta");
  }

  try {
    await claimCustomerOrder({ formData, user });
    revalidatePath("/conta");
  } catch (error) {
    redirectWithError(error.message);
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
    revalidatePath("/admin");
  } catch (error) {
    redirectWithError(error.message);
  }

  redirect("/conta?status=avaliacao-enviada");
}
