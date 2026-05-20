import { CartCheckout } from "@/src/components/catalog/catalog-experience.js";
import { catalogProducts, getPublicCatalogProducts } from "@/src/catalog/index.js";
import { getCurrentCustomerSnapshot } from "@/src/customer/customer-data.js";
import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

export const metadata = {
  title: "Carrinho e pedido | TSZR15",
  description: "Carrinho de compra separado da home, com dados de entrega e envio por WhatsApp."
};

export default async function CartPage() {
  const supabase = await createServerSupabaseClient();
  const customerSnapshot = await getCurrentCustomerSnapshot(supabase);

  return (
    <main className="page-shell">
      <CartCheckout
        currentUser={customerSnapshot.user}
        initialCustomer={customerSnapshot.customer}
        isSupabaseConfigured={customerSnapshot.supabaseConfigured}
        products={getPublicCatalogProducts(catalogProducts)}
      />
    </main>
  );
}
