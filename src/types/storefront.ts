export interface Product {
  id: string;
  imageUrls: string[];
  name: string;
  priceCents: number;
  productFamily: string;
  slug: string;
  variations: string[];
  variationImages?: VariationImages[];
  variationStock?: VariationStock[];
}

export interface VariationImages {
  imageUrls: string[];
  variation: string;
}

export interface VariationStock {
  quantity: number | null;
  variation: string;
}

export interface CartItem {
  cartKey: string;
  id: string;
  quantity: number;
  variation: string;
}

export interface Customer {
  address: string;
  cep: string;
  email: string;
  name: string;
  phone: string;
  taxId: string;
  whatsapp: string;
}
