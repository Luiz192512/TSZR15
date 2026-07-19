export const maxAdminProductImages = 12;

function isUploadFile(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.name === "string" &&
    value.size > 0
  );
}

export function getAdminProductImageFiles(formData) {
  const files = formData.getAll("imageFiles").filter(isUploadFile);

  if (files.length > maxAdminProductImages) {
    throw new Error(`Envie no maximo ${maxAdminProductImages} imagens por produto.`);
  }

  return files;
}
