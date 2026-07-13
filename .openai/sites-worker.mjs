import worker from "../.open-next/worker.js";

export {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "../.open-next/worker.js";

function serializeError(error) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  return {
    cause: error.cause instanceof Error ? error.cause.message : error.cause,
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await worker.fetch(request, env, ctx);
    } catch (error) {
      console.error("TSZR15 Sites runtime error", error);

      const debugToken = env.TSZR15_SITES_DEBUG_TOKEN;
      const suppliedToken = request.headers.get("x-tszr15-debug");

      if (debugToken && suppliedToken === debugToken) {
        return Response.json(serializeError(error), { status: 500 });
      }

      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
