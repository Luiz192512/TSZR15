import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const openNextDir = join(root, ".open-next");
const bundleDir = join(root, ".sites-worker-bundle");
const bundleUpload = join(bundleDir, "upload.multipart");
const distDir = join(root, "dist");
const serverDir = join(distDir, "server");
const assetsDir = join(openNextDir, "assets");

await rm(distDir, { force: true, recursive: true });
await mkdir(serverDir, { recursive: true });

const multipart = await readFile(bundleUpload, "utf8");
const boundary = multipart.slice(0, multipart.indexOf("\n")).trim();
const workerPart =
  'Content-Disposition: form-data; name="sites-worker.js"; filename="sites-worker.js"';
const workerHeader = multipart.indexOf(workerPart);
const headerEnd = multipart.indexOf("\r\n\r\n", workerHeader);
const newlineSize = headerEnd >= 0 ? 4 : 2;
const normalizedHeaderEnd =
  headerEnd >= 0 ? headerEnd : multipart.indexOf("\n\n", workerHeader);
const workerStart = normalizedHeaderEnd + newlineSize;
const windowsWorkerEnd = multipart.indexOf(`\r\n${boundary}`, workerStart);
const workerEnd =
  windowsWorkerEnd >= 0
    ? windowsWorkerEnd
    : multipart.indexOf(`\n${boundary}`, workerStart);

if (!boundary || workerHeader < 0 || normalizedHeaderEnd < 0 || workerEnd < 0) {
  throw new Error("Wrangler did not emit the expected Sites Worker module");
}

await writeFile(
  join(serverDir, "index.js"),
  multipart.slice(workerStart, workerEnd),
);

await cp(assetsDir, join(distDir, "assets"), { recursive: true });
await cp(assetsDir, join(distDir, "client"), { recursive: true });
await cp(
  join(root, ".openai", "sites-wrangler.json"),
  join(serverDir, "wrangler.json"),
);
