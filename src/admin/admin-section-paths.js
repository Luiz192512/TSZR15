export const adminSectionPaths = {
  analise: "/admin/analise",
  cupons: "/admin/cupons",
  pedidos: "/admin/pedidos",
  produtos: "/admin/produtos"
};

export const defaultAdminSectionPath = adminSectionPaths.pedidos;

// Mantem os links antigos de /admin?tab=... funcionando: a secao vira segmento
// de rota e todos os demais parametros (selecao, paginacao, status) seguem
// intactos na query string.
export function resolveAdminSectionRedirect(params) {
  const basePath = adminSectionPaths[String(params?.tab ?? "")] ?? defaultAdminSectionPath;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (key === "tab" || value === undefined) {
      continue;
    }

    for (const entry of Array.isArray(value) ? value : [value]) {
      query.append(key, String(entry));
    }
  }

  const search = query.toString();

  return search ? `${basePath}?${search}` : basePath;
}
