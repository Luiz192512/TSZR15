import {
  createInternalActionError,
  getSafeActionErrorState,
  isInternalActionError
} from "../lib/action-error.js";

const adminFallbackMessage = "Nao foi possivel concluir a operacao no painel.";

export function createAdminDatabaseError(error, operation) {
  return createInternalActionError(error, operation);
}

export function isInternalAdminError(error) {
  return isInternalActionError(error);
}

export function getAdminActionErrorState(error, options = {}) {
  return getSafeActionErrorState(error, {
    event: "admin_action_failed",
    fallbackMessage: adminFallbackMessage,
    prefix: "ADM",
    ...options
  });
}
