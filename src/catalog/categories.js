export const storefrontCategories = [
  { id: "suporte-sliders", label: "Suporte & Sliders", slug: "suporte-sliders" },
  { id: "estetica", label: "Estética", slug: "estetica" },
  { id: "escapamentos", label: "Escapamentos", slug: "escapamentos" },
  { id: "adesivagem", label: "Adesivagem", slug: "adesivos" },
  { id: "manutencao", label: "Manutenção", slug: "manutencao" }
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

export const renderSlots = [
  "bolha",
  "frente-carenagem",
  "asa-lateral",
  "entrada-de-ar",
  "retrovisor",
  "manete-manopla-pesinho",
  "pisca-dianteiro",
  "farol",
  "lanterna-traseira",
  "rabeta-eliminador",
  "monoposto",
  "escapamento",
  "protetor-radiador",
  "protetor-tanque",
  "tampa-tanque",
  "tampa-oleo",
  "tampao-pinhao",
  "suporte-celular",
  "suporte-garupa",
  "slider",
  "adesivagem-completa"
];

export const storefrontCategoryMap = new Map(
  storefrontCategories.map((category) => [category.id, category])
);
