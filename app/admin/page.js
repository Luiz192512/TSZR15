import { redirect } from "next/navigation";

const adminSectionPaths = {
  analise: "/admin/analise",
  cupons: "/admin/cupons",
  pedidos: "/admin/pedidos",
  produtos: "/admin/produtos"
};

function buildForwardedQuery(params) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (key === "tab" || value === undefined) {
      continue;
    }

    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, String(entry));
    }
  }

  return query.toString();
}

export default async function AdminIndexPage({ searchParams }) {
  const params = await searchParams;
  const basePath = adminSectionPaths[String(params?.tab ?? "")] ?? adminSectionPaths.pedidos;
  const query = buildForwardedQuery(params);

  redirect(query ? `${basePath}?${query}` : basePath);
}
