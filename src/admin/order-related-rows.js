// O PostgREST recebe filtros .in() na query string; ~150 UUIDs por consulta
// mantem a URL folgadamente abaixo dos limites de proxy (8-16KB).
export const orderIdChunkSize = 150;

function chunkList(values, chunkSize) {
  const chunks = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

export async function fetchRowsForOrderIds({
  buildQuery,
  chunkSize = orderIdChunkSize,
  orderIds
}) {
  const chunks = chunkList(orderIds ?? [], chunkSize);
  const results = await Promise.all(chunks.map((chunk) => buildQuery(chunk)));
  const firstError = results.find(({ error }) => error)?.error ?? null;

  if (firstError) {
    return { data: null, error: firstError };
  }

  return { data: results.flatMap(({ data }) => data ?? []), error: null };
}
