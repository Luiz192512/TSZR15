const optimizedProductImagePattern = /-(thumb|card|detail)\.webp(\?.*)?$/i;

function replaceVariant(imageUrl, variant) {
  return imageUrl.replace(optimizedProductImagePattern, `-${variant}.webp$2`);
}

export function isOptimizedProductImageUrl(imageUrl) {
  return optimizedProductImagePattern.test(String(imageUrl ?? ""));
}

export function getProductImageVariants(imageUrl) {
  const url = String(imageUrl ?? "").trim();

  if (!url) {
    return {
      card: "",
      detail: "",
      thumb: ""
    };
  }

  if (!isOptimizedProductImageUrl(url)) {
    return {
      card: url,
      detail: url,
      thumb: url
    };
  }

  return {
    card: replaceVariant(url, "card"),
    detail: replaceVariant(url, "detail"),
    thumb: replaceVariant(url, "thumb")
  };
}
