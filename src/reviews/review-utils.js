export const reviewStatuses = [
  { id: "pending", label: "Pendente" },
  { id: "approved", label: "Aprovada" },
  { id: "rejected", label: "Recusada" }
];

export const maxReviewPhotos = 5;
export const maxReviewPhotoSizeBytes = 5 * 1024 * 1024;
export const allowedReviewImageMimeTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

const mimeExtensions = {
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function cleanReviewString(value, maxLength = 1200) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function parseReviewRating(value) {
  const rating = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

export function getReviewStatusLabel(status) {
  return reviewStatuses.find((item) => item.id === status)?.label ?? "Pendente";
}

export function sanitizePublicReviewerName(value) {
  const cleaned = cleanReviewString(value, 80);

  if (!cleaned) {
    return "Cliente TSZR15";
  }

  const [firstName] = cleaned.split(" ").filter(Boolean);
  return firstName ? `${firstName} - cliente TSZR15` : "Cliente TSZR15";
}

export function validateReviewInput({ comment, rating }) {
  const cleanComment = cleanReviewString(comment, 1200);
  const parsedRating = parseReviewRating(rating);
  const errors = [];

  if (!parsedRating) {
    errors.push("Escolha uma nota de 1 a 5 estrelas.");
  }

  if (cleanComment.length < 8) {
    errors.push("Escreva um comentario com pelo menos 8 caracteres.");
  }

  return {
    comment: cleanComment,
    errors,
    rating: parsedRating
  };
}

export function detectImageMimeType(bytes) {
  if (!bytes || bytes.length < 4) {
    return "";
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return "";
}

export function getReviewImageExtension(mimeType) {
  return mimeExtensions[mimeType] ?? "";
}

export function validateReviewImageMeta({ detectedMimeType, sizeBytes }) {
  const errors = [];

  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    errors.push("Imagem vazia ou invalida.");
  }

  if (sizeBytes > maxReviewPhotoSizeBytes) {
    errors.push("Cada foto da avaliacao deve ter no maximo 5MB.");
  }

  if (!allowedReviewImageMimeTypes.has(detectedMimeType)) {
    errors.push("Envie fotos JPG, PNG, WEBP ou GIF.");
  }

  return errors;
}

export function buildReviewSummary(reviews = []) {
  const approvedReviews = reviews.filter((review) => review.status === "approved");
  const totalRating = approvedReviews.reduce((total, review) => total + (review.rating ?? 0), 0);
  const reviewCount = approvedReviews.length;

  return {
    averageRating: reviewCount > 0 ? Math.round((totalRating / reviewCount) * 10) / 10 : 0,
    reviewCount
  };
}
