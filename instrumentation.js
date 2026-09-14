// Verificação de coerência de ambiente na inicialização.
//
// Falhar aqui derruba o deploy inteiro de propósito: um Worker que subiu com
// credencial de produção apontando para o banco de preview (ou o contrário) é
// pior do que um Worker que não subiu. O mesmo guard roda de novo no ponto de
// uso do cliente com service role, porque este hook não cobre todo caminho de
// execução no runtime da Cloudflare.

import { findEnvironmentIncoherences } from "./src/lib/environment-guard.js";
import { logServerEvent } from "./src/lib/logger.js";
import { getRuntimeTarget } from "./src/lib/runtime-target.js";

export function register() {
  const target = getRuntimeTarget();
  const problems = findEnvironmentIncoherences();

  if (problems.length) {
    logServerEvent("error", "environment_incoherent", { problems, target });

    throw new Error(
      `Ambiente incoerente (alvo "${target}"):\n- ${problems.join("\n- ")}\n` +
        "Corrija as variáveis antes de subir. Ver docs/AMBIENTES.md."
    );
  }

  logServerEvent("info", "environment_resolved", { target });
}
