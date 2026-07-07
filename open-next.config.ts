import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

export default defineCloudflareConfig({
  // ISR/prerender payloads (home, catálogo, produto) live in KV.
  incrementalCache: kvIncrementalCache,
  // Time-based revalidation (revalidate: 60) is serialized through a Durable Object queue.
  queue: doQueue,
  // revalidatePath()/revalidateTag() (used by /api/revalidate) need the D1 tag cache.
  tagCache: d1NextTagCache,
  enableCacheInterception: true,
});
