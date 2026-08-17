export const storefrontCategories = [
  { id: "suporte-sliders", label: "Suporte & Sliders", slug: "suporte-sliders" },
  { id: "estetica", label: "Estética", slug: "estetica" },
  { id: "escapamentos", label: "Escapamentos", slug: "escapamentos" },
  { id: "adesivagem", label: "Adesivagem", slug: "adesivos" },
  { id: "manutencao", label: "Manutenção", slug: "manutencao" },
  { id: "vestuario", label: "Vestuário", slug: "vestuario" }
];

// Vestuario saiu da lista de bloqueio: a loja passou a vender roupas.
// A constante fica para curadoria futura de outras categorias.
export const blockedStorefrontCategoryIds = [];

export const technicalFamilies = [
  "aero_front",
  "iluminacao",
  "retrovisor",
  "controles",
  "slider",
  "protecao",
  "escapamento",
  "adesivo_full",
  "adesivo_detalhe",
  "tanque",
  "cockpit",
  "manutencao",
  "vestuario"
];

export const storefrontCategoryMap = new Map(
  storefrontCategories.map((category) => [category.id, category])
);

export function formatCategoryLabels(categoryIds = []) {
  return categoryIds.map(
    (categoryId) => storefrontCategoryMap.get(categoryId)?.label ?? categoryId
  );
}
