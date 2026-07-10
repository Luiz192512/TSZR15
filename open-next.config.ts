import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

const config = defineCloudflareConfig({
  // ISR/prerender payloads (home, catálogo, produto) live in KV.
  incrementalCache: kvIncrementalCache,
  // Time-based revalidation (revalidate: 60) is serialized through a Durable Object queue.
  queue: doQueue,
  // revalidatePath()/revalidateTag() (used by /api/revalidate) need the D1 tag cache.
  tagCache: d1NextTagCache,
  enableCacheInterception: true,
});

// Next 16 builda com Turbopack por padrão, mas os chunks gerados falham no
// runtime do Worker (ChunkLoadError em rotas SSR). Força o build webpack.
config.buildCommand = "npx next build --webpack";

export default config;
