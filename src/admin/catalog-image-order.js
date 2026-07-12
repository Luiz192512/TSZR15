const maxProductImages = 12;

export function isValidImageUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  if (value.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveImageOrder(tokens, uploadedUrls = []) {
  const resolved = [];

  for (const token of tokens ?? []) {
    const uploadMatch = /^new:(\d+)$/.exec(token);

    if (uploadMatch) {
      const uploadedUrl = uploadedUrls[Number(uploadMatch[1])];

      if (uploadedUrl) {
        resolved.push(uploadedUrl);
      }

      continue;
    }

    if (isValidImageUrl(token)) {
      resolved.push(token);
    }
  }

  return resolved.slice(0, maxProductImages);
}
