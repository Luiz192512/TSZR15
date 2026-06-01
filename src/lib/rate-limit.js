import { createHash } from "node:crypto";

const localRateLimitStore = new Map();
const productionEnvironments = new Set(["production", "preview"]);

export const rateLimitProfiles = {
  adminLogin: {
    blockSeconds: 15 * 60,
    limit: 5,
    scope: "admin-login",
    windowSeconds: 15 * 60
  },
  checkout: {
    blockSeconds: 60,
    limit: 10,
    scope: "checkout-whatsapp",
    windowSeconds: 60
  },
  coupon: {
    blockSeconds: 60,
    limit: 20,
    scope: "coupon-validate",
    windowSeconds: 60
  }
};

function isStrictRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    productionEnvironments.has(process.env.VERCEL_ENV ?? "")
  );
}

function toHeaderGetter(headersLike) {
  const headers = headersLike?.headers ?? headersLike;

  if (typeof headers?.get === "function") {
    return (name) => headers.get(name);
  }

  return (name) => {
    const lowerName = name.toLowerCase();
    const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === lowerName);

    return entry?.[1] ?? null;
  };
}

export function getRequestIp(headersLike) {
  const getHeader = toHeaderGetter(headersLike);
  const forwardedFor = getHeader("x-forwarded-for");
  const realIp = getHeader("x-real-ip");
  const candidate = String(forwardedFor || realIp || "unknown")
    .split(",")[0]
    .trim();

  return candidate || "unknown";
}

export function hashRateLimitIdentifier(identifier) {
  return createHash("sha256")
    .update(String(identifier ?? "unknown"))
    .digest("hex");
}

function normalizeRateLimitResult(data, fallbackLimit) {
  return {
    allowed: Boolean(data?.allowed),
    count: Number(data?.count ?? 0),
    limit: Number(data?.limit ?? fallbackLimit),
    remaining: Number(data?.remaining ?? 0),
    retryAfterSeconds: Number(data?.retryAfterSeconds ?? data?.retry_after_seconds ?? 0),
    unavailable: false
  };
}

function consumeLocalRateLimit({
  blockSeconds,
  increment,
  identifierHash,
  limit,
  scope,
  windowSeconds
}) {
  const key = `${scope}:${identifierHash}`;
  const now = Date.now();
  const existing = localRateLimitStore.get(key);

  if (!existing || existing.windowStartedAt <= now - windowSeconds * 1000) {
    if (!increment) {
      return {
        allowed: true,
        count: 0,
        limit,
        remaining: limit,
        retryAfterSeconds: 0,
        unavailable: false
      };
    }

    const nextEntry = {
      attemptCount: 1,
      blockedUntil: 0,
      windowStartedAt: now
    };

    localRateLimitStore.set(key, nextEntry);

    return {
      allowed: true,
      count: 1,
      limit,
      remaining: Math.max(limit - 1, 0),
      retryAfterSeconds: 0,
      unavailable: false
    };
  }

  if (existing.blockedUntil > now) {
    return {
      allowed: false,
      count: existing.attemptCount,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.blockedUntil - now) / 1000), 1),
      unavailable: false
    };
  }

  if (!increment) {
    return {
      allowed: true,
      count: existing.attemptCount,
      limit,
      remaining: Math.max(limit - existing.attemptCount, 0),
      retryAfterSeconds: 0,
      unavailable: false
    };
  }

  const nextCount = existing.attemptCount + 1;

  if (nextCount > limit) {
    existing.attemptCount = nextCount;
    existing.blockedUntil = now + blockSeconds * 1000;
    localRateLimitStore.set(key, existing);

    return {
      allowed: false,
      count: nextCount,
      limit,
      remaining: 0,
      retryAfterSeconds: blockSeconds,
      unavailable: false
    };
  }

  existing.attemptCount = nextCount;
  existing.blockedUntil = 0;
  localRateLimitStore.set(key, existing);

  return {
    allowed: true,
    count: nextCount,
    limit,
    remaining: Math.max(limit - nextCount, 0),
    retryAfterSeconds: 0,
    unavailable: false
  };
}

export async function consumeRateLimit({
  blockSeconds,
  failClosed = true,
  identifier,
  increment = true,
  limit,
  scope,
  supabase,
  windowSeconds
}) {
  const identifierHash = hashRateLimitIdentifier(identifier);
  const effectiveBlockSeconds = blockSeconds ?? windowSeconds;

  if (supabase) {
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_block_seconds: effectiveBlockSeconds,
      p_identifier_hash: identifierHash,
      p_increment: increment,
      p_limit: limit,
      p_scope: scope,
      p_window_seconds: windowSeconds
    });

    if (!error) {
      return normalizeRateLimitResult(data, limit);
    }

    return {
      allowed: false,
      count: 0,
      error,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(effectiveBlockSeconds, 60),
      unavailable: true
    };
  }

  if (failClosed && isStrictRuntime()) {
    return {
      allowed: false,
      count: 0,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(effectiveBlockSeconds, 60),
      unavailable: true
    };
  }

  return consumeLocalRateLimit({
    blockSeconds: effectiveBlockSeconds,
    identifierHash,
    increment,
    limit,
    scope,
    windowSeconds
  });
}

export async function resetRateLimit({ identifier, scope, supabase }) {
  const identifierHash = hashRateLimitIdentifier(identifier);

  if (supabase) {
    await supabase.rpc("reset_rate_limit", {
      p_identifier_hash: identifierHash,
      p_scope: scope
    });
    return;
  }

  localRateLimitStore.delete(`${scope}:${identifierHash}`);
}

export function clearLocalRateLimitStore() {
  localRateLimitStore.clear();
}
