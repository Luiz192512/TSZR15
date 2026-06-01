export function createRateLimitResponse(
  result,
  {
    rateLimitedMessage = "Muitas tentativas. Tente novamente em instantes.",
    unavailableMessage = "Protecao de abuso indisponivel no momento. Tente novamente em instantes."
  } = {}
) {
  const status = result.unavailable ? 503 : 429;
  const error = result.unavailable ? unavailableMessage : rateLimitedMessage;
  const retryAfterSeconds = Number(result.retryAfterSeconds ?? 60);

  return Response.json(
    {
      error,
      retryAfterSeconds
    },
    {
      headers: {
        "Retry-After": String(retryAfterSeconds)
      },
      status
    }
  );
}
