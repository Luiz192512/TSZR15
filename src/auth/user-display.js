function cleanDisplayValue(value, maxLength = 80) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function getUserDisplayName(user) {
  const metadataName = cleanDisplayValue(user?.user_metadata?.full_name);
  const emailPrefix = cleanDisplayValue(user?.email?.split("@")[0]);

  return metadataName || emailPrefix || "Cliente";
}

export function getUserInitials(user) {
  const displayName = getUserDisplayName(user)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const words = displayName
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0) {
    return "C";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
