export const storefrontCategories = [
  { id: "suporte-sliders", label: "Suporte & Sliders", slug: "suporte-sliders" },
  { id: "estetica", label: "Estetica", slug: "estetica" },
  { id: "escapamentos", label: "Escapamentos", slug: "escapamentos" },
  { id: "adesivagem", label: "Adesivagem", slug: "adesivos" },
  { id: "manutencao", label: "Manutencao", slug: "manutencao" }
];

export const blockedStorefrontCategoryIds = ["vestuario"];

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
  "manutencao"
];

export const storefrontCategoryMap = new Map(
  storefrontCategories.map((category) => [category.id, category])
);
