import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const openNextDir = join(root, ".open-next");
const distDir = join(root, "dist");
const serverDir = join(distDir, "server");
const assetsDir = join(openNextDir, "assets");

await rm(distDir, { force: true, recursive: true });
await mkdir(serverDir, { recursive: true });
await cp(openNextDir, serverDir, { recursive: true });

// Sites uploads server files as Worker modules. Public assets and traced source
// files must stay outside that module tree.
await rm(join(serverDir, "assets"), { force: true, recursive: true });
await rm(join(serverDir, "server-functions", "default", "src"), {
  force: true,
  recursive: true,
});

await cp(assetsDir, join(distDir, "assets"), { recursive: true });
await cp(assetsDir, join(distDir, "client"), { recursive: true });
await cp(join(serverDir, "worker.js"), join(serverDir, "index.js"));
await cp(
  join(root, ".openai", "sites-wrangler.json"),
  join(serverDir, "wrangler.json"),
);
