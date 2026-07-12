import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

// O projeto usa JSX em arquivos .js (padrao do Next). O pipeline padrao do
// Vitest so trata JSX em .jsx/.tsx, entao transformamos os .js do projeto com
// o esbuild (ja incluso no Vite, sem nova dependencia) antes da analise de import.
function jsxInJsPlugin() {
  return {
    enforce: "pre",
    name: "tszr15-jsx-in-js",
    async transform(code, id) {
      const filePath = id.split("?")[0];

      if (filePath.includes("node_modules") || !/\.jsx?$/.test(filePath)) {
        return null;
      }

      return transformWithEsbuild(code, filePath, { jsx: "automatic", loader: "jsx" });
    }
  };
}

export default defineConfig({
  plugins: [jsxInJsPlugin()],
  resolve: {
    alias: [{ find: /^@\//, replacement: `${rootDir}/` }]
  },
  test: {
    environment: "node",
    include: ["tests/**/*.vitest.{mjs,jsx}"]
  }
});
