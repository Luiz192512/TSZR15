export const THEME_STORAGE_KEY = "tszr15-theme";
export const THEME_LIGHT = "light";
export const THEME_DARK = "dark";

/**
 * Script inline aplicado no <head>, antes do primeiro paint.
 *
 * O HTML é renderizado no Worker, que não sabe qual tema o visitante escolheu:
 * sem isto a página pinta clara e só depois vira escura — o flash que a fase
 * proíbe. Ler localStorage aqui é síncrono e acontece antes do CSS pintar.
 *
 * Sem escolha salva, nada é escrito: o CSS resolve sozinho por
 * `prefers-color-scheme`, e o padrão continua sendo o tema claro.
 *
 * A CSP permite `script-src 'self' 'unsafe-inline'`, então o inline passa.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t==="${THEME_DARK}"||t==="${THEME_LIGHT}"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})()`;
