import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import nextDynamic from "next/dynamic";

import { getPublicCatalogProductsForStorefront } from "@/src/catalog/supabase-catalog.js";
import { getSupabaseConfigStatus } from "@/src/lib/supabase/config.js";

const CartCheckout = nextDynamic(() =>
  import("@/src/components/catalog/cart-checkout.js").then((module) => module.CartCheckout)
);

export const metadata = {
  title: "Carrinho e pedido | TSZR15",
  description: "Carrinho de compra separado da home, com dados de entrega e envio por WhatsApp."
};
export const revalidate = 60;

export default async function CartPage() {
  const catalog = await getPublicCatalogProductsForStorefront();
  const { isConfigured } = getSupabaseConfigStatus();

  return (
    <main className={cx(globalStyles, "page-shell")}>
      <CartCheckout
        currentUser={null}
        initialCustomer={null}
        isSupabaseConfigured={isConfigured}
        products={catalog.products}
      />
    </main>
  );
}
