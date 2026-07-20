function toHeaderGetter(headersLike) {
  const headers = headersLike?.headers ?? headersLike;

  if (typeof headers?.get === "function") {
    return (name) => headers.get(name);
  }

  return (name) => {
    const target = name.toLowerCase();
    const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === target);

    return entry?.[1] ?? null;
  };
}

export function isSameOriginRequest(headersLike) {
  const getHeader = toHeaderGetter(headersLike);
  const origin = getHeader("origin");
  const host = getHeader("host");

  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host.toLowerCase() === String(host).trim().toLowerCase();
  } catch {
    return false;
  }
}

export function isJsonRequest(headersLike) {
  const getHeader = toHeaderGetter(headersLike);
  const contentType = getHeader("content-type");

  return String(contentType ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase() === "application/json";
}
