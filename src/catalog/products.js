import { getImportDecision } from "./importRules.js";

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildProduct({
  name,
  storefrontCategoryIds,
  productFamily,
  renderSlot = null,
  bikeModelScope = ["yamaha-r15"],
  notes = ""
}) {
  return {
    id: slugify(name),
    slug: slugify(name),
    name,
    storefrontCategoryIds,
    productFamily,
    renderSlot,
    bikeModelScope,
    is3DEligible: Boolean(renderSlot),
    compatibilityRules: renderSlot
      ? [
          {
            type: "exclusive-slot",
            slot: renderSlot,
            message: "Apenas um item pode ocupar este slot do configurador."
          }
        ]
      : [],
    supplierSource: {
      provider: "sandimr15.store",
      importMode: "manual-curated",
      sourceCategoryIds: storefrontCategoryIds
    },
    notes
  };
}

function buildProducts(definitions) {
  return definitions.map(buildProduct);
}

export const rawCatalogProducts = [
  ...buildProducts([
    {
      name: "Kit Suporte + Slider",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      renderSlot: "slider"
    },
    {
      name: "Somente Suporte para Slider",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider"
    },
    {
      name: "Slider Escapamento",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      renderSlot: "slider"
    },
    {
      name: "Slider de Balança",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      renderSlot: "slider"
    },
    {
      name: "Slider Esportivo em Alumínio (Somente Slider)",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      renderSlot: "slider"
    },
    {
      name: "Escapamento SC Project Completo",
      storefrontCategoryIds: ["escapamentos"],
      productFamily: "escapamento",
      renderSlot: "escapamento"
    },
    {
      name: "Ponteira SC Project",
      storefrontCategoryIds: ["escapamentos"],
      productFamily: "escapamento",
      renderSlot: "escapamento"
    },
    {
      name: "Filtro de AR Esportivo",
      storefrontCategoryIds: ["escapamentos", "manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Cavalete Completo",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Luz de Placa Original",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Kit Desengraxante + Lubrificante",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Escova de Limpeza Corrente",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Óleo Yamalube 10w40",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Kit Completo Manutenção",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Kit Pastilhas Diafrag",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Kit Pastilhas Embu's",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Kit Relação",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Filtro de Óleo",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Kit Chave Allen 16 em 1",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Kit Reparo Pneu",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao"
    },
    {
      name: "Adesivo Capacete Holográfico",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "RR Adesivo Frontal",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "GP Racing Holográfico",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Garras Adesivos Frontal",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Hayabusa Adesivos Japonês",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Friso e Logotipo Refletivo Roda",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Frisos Refletivo Roda",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Película PPF Kit Full",
      storefrontCategoryIds: ["adesivagem", "estetica"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Protetor de Tanque Completo",
      storefrontCategoryIds: ["adesivagem", "estetica"],
      productFamily: "tanque",
      renderSlot: "protetor-tanque"
    },
    {
      name: "Protetor de Tanque Lateral Emborrachado",
      storefrontCategoryIds: ["adesivagem", "estetica"],
      productFamily: "tanque",
      renderSlot: "protetor-tanque"
    },
    {
      name: "Protetor de Tanque Importado",
      storefrontCategoryIds: ["adesivagem", "estetica"],
      productFamily: "tanque",
      renderSlot: "protetor-tanque"
    },
    {
      name: "Adesivo Completo AllBlack",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Camaleão Monster MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Custom Red Bull MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Design Exclusivo",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Fiat MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Line Roxa",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Monster Eneos",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Monster Energy MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Monster MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Monster Savage",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Monster Savage Cinza",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Monster Vermelho",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Movestar MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Racing X",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Red Bull MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Shark",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Venom",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Yamalube",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      renderSlot: "adesivagem-completa"
    },
    {
      name: "Bolha Esportiva",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "bolha"
    },
    {
      name: "Carenagem Frontal Aerodinâmica",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "frente-carenagem"
    },
    {
      name: "Frente R6",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "frente-carenagem"
    },
    {
      name: "Carenagem Entrada de AR",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "entrada-de-ar"
    },
    {
      name: "Carenagem Inferior Moto GP",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "frente-carenagem"
    },
    {
      name: "Spoiler Frontal Depletor",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "frente-carenagem"
    },
    {
      name: "Spoilers Aerodinâmicos Laterais",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "asa-lateral"
    },
    {
      name: "Asa Lateral Aerodinâmica",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "asa-lateral"
    },
    {
      name: "Garras de Aranha",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit"
    },
    {
      name: "Eliminador de Rabeta",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "rabeta-eliminador"
    },
    {
      name: "Kit Eliminador de Rabeta + Pisca",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "rabeta-eliminador"
    },
    {
      name: "Monoposto",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "monoposto"
    },
    {
      name: "Farol LED DRL Predator Eye",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "farol"
    },
    {
      name: "Lanterna Colmeia",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "lanterna-traseira"
    },
    {
      name: "Lanterna Neon Rainbow",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "lanterna-traseira"
    },
    {
      name: "Lanterna Seta Tripla",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "lanterna-traseira"
    },
    {
      name: "LED DRL Traseiro",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "lanterna-traseira"
    },
    {
      name: "LED RGB DRL",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "farol"
    },
    {
      name: "Pisca Led Embutido",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "pisca-dianteiro"
    },
    {
      name: "Pisca Led Esportivo",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "pisca-dianteiro"
    },
    {
      name: "Pisca Embutido na Carenagem",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      renderSlot: "pisca-dianteiro"
    },
    {
      name: "Retrovisor Asa",
      storefrontCategoryIds: ["estetica"],
      productFamily: "retrovisor",
      renderSlot: "retrovisor"
    },
    {
      name: "Retrovisor ZX10",
      storefrontCategoryIds: ["estetica"],
      productFamily: "retrovisor",
      renderSlot: "retrovisor"
    },
    {
      name: "Retrovisor Melhor Campo de Visão",
      storefrontCategoryIds: ["estetica"],
      productFamily: "retrovisor",
      renderSlot: "retrovisor"
    },
    {
      name: "Kit Manete/Manopla/Pesinho",
      storefrontCategoryIds: ["estetica"],
      productFamily: "controles",
      renderSlot: "manete-manopla-pesinho"
    },
    {
      name: "KIT Manete & Manopla",
      storefrontCategoryIds: ["estetica"],
      productFamily: "controles",
      renderSlot: "manete-manopla-pesinho"
    },
    {
      name: "Pesinho Guidão",
      storefrontCategoryIds: ["estetica"],
      productFamily: "controles",
      renderSlot: "manete-manopla-pesinho"
    },
    {
      name: "Suporte para Celular Quad Lock",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit",
      renderSlot: "suporte-celular"
    },
    {
      name: "Suporte para Celular com Carregador",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit",
      renderSlot: "suporte-celular"
    },
    {
      name: "Suporte para Garupa",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao",
      renderSlot: "suporte-garupa"
    },
    {
      name: "Tampa da Bengala",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit"
    },
    {
      name: "Tampa do Óleo",
      storefrontCategoryIds: ["estetica"],
      productFamily: "manutencao",
      renderSlot: "tampa-oleo"
    },
    {
      name: "Tampa do Tanque",
      storefrontCategoryIds: ["estetica"],
      productFamily: "tanque",
      renderSlot: "tampa-tanque"
    },
    {
      name: "Tampão do Pinhão",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao",
      renderSlot: "tampao-pinhao"
    },
    {
      name: "Capas do Retrovisor",
      storefrontCategoryIds: ["estetica"],
      productFamily: "retrovisor",
      renderSlot: "retrovisor"
    },
    {
      name: "Capas do Garfo",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao"
    },
    {
      name: "Protetor de Mesa",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit"
    },
    {
      name: "Película de proteção do painel",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit"
    },
    {
      name: "Protetor de Manete",
      storefrontCategoryIds: ["estetica"],
      productFamily: "controles",
      renderSlot: "manete-manopla-pesinho"
    },
    {
      name: "Protetor de Radiador Aço",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao",
      renderSlot: "protetor-radiador"
    },
    {
      name: "Protetor de Radiador Alumínio",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao",
      renderSlot: "protetor-radiador"
    },
    {
      name: "Protetor de Coroa",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao"
    },
    {
      name: "Protetor de Corrente",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao"
    },
    {
      name: "Protetor Reservatório Traseiro",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao"
    },
    {
      name: "Protetor Sensor ABS",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao"
    },
    {
      name: "Trava Antifurto",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao"
    },
    {
      name: "Estabilizador de Direção",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit"
    },
    {
      name: "Kit Slider Yamaha R3",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      renderSlot: "slider",
      bikeModelScope: ["yamaha-r3"]
    },
    {
      name: "Carenagem Frontal SBM 250s",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      renderSlot: "frente-carenagem",
      bikeModelScope: ["sbm-250s"]
    },
    {
      name: "Camiseta Premium",
      storefrontCategoryIds: ["vestuario"],
      productFamily: "manutencao"
    }
  ])
];

export const catalogProducts = rawCatalogProducts.filter((product) =>
  getImportDecision(product).accepted
);

export const rejectedCatalogProducts = rawCatalogProducts
  .map((product) => ({
    ...product,
    importDecision: getImportDecision(product)
  }))
  .filter((product) => !product.importDecision.accepted);
