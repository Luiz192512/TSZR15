import { getImportDecision } from "./importRules.js";

const defaultPricesByFamily = {
  aero_front: 24990,
  adesivo_detalhe: 3990,
  adesivo_full: 27990,
  cockpit: 8990,
  controles: 14990,
  escapamento: 89000,
  iluminacao: 16990,
  manutencao: 8990,
  protecao: 10990,
  retrovisor: 11990,
  slider: 15990,
  tanque: 6990
};

const defaultVariationsByFamily = {
  aero_front: ["Preto", "Fume", "Carbon look"],
  adesivo_detalhe: ["Holografico", "Branco", "Preto"],
  adesivo_full: ["Brilho", "Fosco", "Personalizar no atendimento"],
  cockpit: ["Preto", "Azul", "Vermelho"],
  controles: ["Preto", "Azul", "Vermelho"],
  escapamento: ["Completo", "Ponteira", "Sob consulta"],
  iluminacao: ["Cristal", "Fume", "Rainbow"],
  manutencao: ["Padrao"],
  protecao: ["Preto", "Aluminio", "Carbon look"],
  retrovisor: ["Preto", "Carbon look"],
  slider: ["Preto", "Azul", "Vermelho"],
  tanque: ["Preto", "Transparente", "Carbon look"]
};

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
  bikeModelScope = ["yamaha-r15"],
  priceCents,
  variations,
  availability = "sob-consulta",
  leadTimeDays = 2,
  shippingClass = "medium",
  imageUrls = [],
  notes = ""
}) {
  return {
    id: slugify(name),
    slug: slugify(name),
    name,
    storefrontCategoryIds,
    productFamily,
    bikeModelScope,
    priceCents: priceCents ?? defaultPricesByFamily[productFamily] ?? 9990,
    currency: "BRL",
    variations: variations ?? defaultVariationsByFamily[productFamily] ?? ["Padrao"],
    availability,
    leadTimeDays,
    shippingClass,
    imageUrls,
    checkoutChannel: "whatsapp-business",
    internalPurchaseSource: {
      importMode: "manual-curated",
      provider: "curadoria-tszr15",
      visibility: "internal-only",
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
      priceCents: 19990
    },
    {
      name: "Somente Suporte para Slider",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      priceCents: 7990
    },
    {
      name: "Slider Escapamento",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      priceCents: 12990
    },
    {
      name: "Slider de Balanca",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      priceCents: 11990
    },
    {
      name: "Slider Esportivo em Aluminio Somente Slider",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      priceCents: 14990
    },
    {
      name: "Escapamento SC Project Completo",
      storefrontCategoryIds: ["escapamentos"],
      productFamily: "escapamento",
      priceCents: 249000,
      shippingClass: "heavy"
    },
    {
      name: "Ponteira SC Project",
      storefrontCategoryIds: ["escapamentos"],
      productFamily: "escapamento",
      priceCents: 89000,
      shippingClass: "heavy"
    },
    {
      name: "Filtro de AR Esportivo",
      storefrontCategoryIds: ["escapamentos", "manutencao"],
      productFamily: "manutencao",
      priceCents: 13990
    },
    {
      name: "Cavalete Completo",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 29990,
      shippingClass: "heavy"
    },
    {
      name: "Luz de Placa Original",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 4990
    },
    {
      name: "Kit Desengraxante + Lubrificante",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 6990
    },
    {
      name: "Escova de Limpeza Corrente",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 2990
    },
    {
      name: "Oleo Yamalube 10w40",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 5490
    },
    {
      name: "Kit Completo Manutencao",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 24990
    },
    {
      name: "Kit Pastilhas Diafrag",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 12990
    },
    {
      name: "Kit Pastilhas Embus",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 11990
    },
    {
      name: "Kit Relacao",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 34990,
      shippingClass: "heavy"
    },
    {
      name: "Filtro de Oleo",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 3990
    },
    {
      name: "Kit Chave Allen 16 em 1",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 3490
    },
    {
      name: "Kit Reparo Pneu",
      storefrontCategoryIds: ["manutencao"],
      productFamily: "manutencao",
      priceCents: 4990
    },
    {
      name: "Adesivo Capacete Holografico",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "RR Adesivo Frontal",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "GP Racing Holografico",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Garras Adesivos Frontal",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Hayabusa Adesivos Japones",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_detalhe"
    },
    {
      name: "Speed Hunters Adesivos Japones",
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
      name: "Pelicula PPF Kit Full",
      storefrontCategoryIds: ["adesivagem", "estetica"],
      productFamily: "adesivo_detalhe",
      priceCents: 9990
    },
    {
      name: "Protetor de Tanque Completo",
      storefrontCategoryIds: ["adesivagem", "estetica"],
      productFamily: "tanque"
    },
    {
      name: "Protetor de Tanque Lateral Emborrachado",
      storefrontCategoryIds: ["adesivagem", "estetica"],
      productFamily: "tanque"
    },
    {
      name: "Protetor de Tanque Importado",
      storefrontCategoryIds: ["adesivagem", "estetica"],
      productFamily: "tanque"
    },
    {
      name: "Adesivo Completo AllBlack",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Camaleao Monster MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Custom Red Bull MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Design Exclusivo",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full",
      priceCents: 34990
    },
    {
      name: "Fiat MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Line Roxa",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Monster Eneos",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Monster Energy MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Monster MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Monster Savage",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Monster Savage Cinza",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Monster Vermelho",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Movestar MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Racing X",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Red Bull MotoGP",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Shark",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Venom",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Yamalube",
      storefrontCategoryIds: ["adesivagem"],
      productFamily: "adesivo_full"
    },
    {
      name: "Bolha Esportiva",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      priceCents: 18990
    },
    {
      name: "Carenagem Frontal Aerodinamica",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      priceCents: 49990,
      shippingClass: "heavy"
    },
    {
      name: "Frente R6",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      priceCents: 69000,
      shippingClass: "heavy"
    },
    {
      name: "Carenagem Entrada de AR",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front"
    },
    {
      name: "Carenagem Inferior Moto GP",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      shippingClass: "heavy"
    },
    {
      name: "Spoiler Frontal Depletor",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front"
    },
    {
      name: "Spoilers Aerodinamicos Laterais",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front"
    },
    {
      name: "Asa Lateral Aerodinamica",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front"
    },
    {
      name: "Garras de Aranha",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit"
    },
    {
      name: "Eliminador de Rabeta",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front"
    },
    {
      name: "Kit Eliminador de Rabeta + Pisca",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      priceCents: 25990
    },
    {
      name: "Monoposto",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
      priceCents: 39990
    },
    {
      name: "Farol LED DRL Predator Eye",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao",
      priceCents: 28990
    },
    {
      name: "Lanterna Colmeia",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao"
    },
    {
      name: "Lanterna Neon Rainbow",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao"
    },
    {
      name: "Lanterna Seta Tripla",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao"
    },
    {
      name: "LED DRL Traseiro",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao"
    },
    {
      name: "LED RGB DRL",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao"
    },
    {
      name: "Pisca Led Embutido",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao"
    },
    {
      name: "Pisca Led Esportivo",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao"
    },
    {
      name: "Pisca Embutido na Carenagem",
      storefrontCategoryIds: ["estetica"],
      productFamily: "iluminacao"
    },
    {
      name: "Retrovisor Asa",
      storefrontCategoryIds: ["estetica"],
      productFamily: "retrovisor"
    },
    {
      name: "Retrovisor ZX10",
      storefrontCategoryIds: ["estetica"],
      productFamily: "retrovisor",
      bikeModelScope: ["yamaha-r15"]
    },
    {
      name: "Retrovisor Melhor Campo de Visao",
      storefrontCategoryIds: ["estetica"],
      productFamily: "retrovisor"
    },
    {
      name: "Kit Manete/Manopla/Pesinho",
      storefrontCategoryIds: ["estetica"],
      productFamily: "controles"
    },
    {
      name: "KIT Manete & Manopla",
      storefrontCategoryIds: ["estetica"],
      productFamily: "controles"
    },
    {
      name: "Pesinho Guidao",
      storefrontCategoryIds: ["estetica"],
      productFamily: "controles",
      priceCents: 7990
    },
    {
      name: "Suporte para Celular Quad Lock",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit",
      priceCents: 14990
    },
    {
      name: "Suporte para Celular com Carregador",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit",
      priceCents: 17990
    },
    {
      name: "Suporte para Garupa",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao"
    },
    {
      name: "Tampa da Bengala",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit"
    },
    {
      name: "Tampa do Oleo",
      storefrontCategoryIds: ["estetica"],
      productFamily: "manutencao"
    },
    {
      name: "Tampa do Tanque",
      storefrontCategoryIds: ["estetica"],
      productFamily: "tanque"
    },
    {
      name: "Tampao do Pinhao",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao"
    },
    {
      name: "Capas do Retrovisor",
      storefrontCategoryIds: ["estetica"],
      productFamily: "retrovisor"
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
      name: "Pelicula de protecao do painel",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit"
    },
    {
      name: "Protetor de Manete",
      storefrontCategoryIds: ["estetica"],
      productFamily: "controles"
    },
    {
      name: "Protetor de Radiador Aco",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao",
      priceCents: 18990
    },
    {
      name: "Protetor de Radiador Aluminio",
      storefrontCategoryIds: ["estetica"],
      productFamily: "protecao",
      priceCents: 21990
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
      name: "Protetor Reservatorio Traseiro",
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
      name: "Estabilizador de Direcao",
      storefrontCategoryIds: ["estetica"],
      productFamily: "cockpit",
      priceCents: 45990
    },
    {
      name: "Kit Slider Yamaha R3",
      storefrontCategoryIds: ["suporte-sliders"],
      productFamily: "slider",
      bikeModelScope: ["yamaha-r3"]
    },
    {
      name: "Carenagem Frontal SBM 250s",
      storefrontCategoryIds: ["estetica"],
      productFamily: "aero_front",
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
