/*
 * Regua de comunidades - elemento-assinatura do tema.
 *
 * A rail lista 87 comunidades como linhas indiferenciadas, mas a distribuicao
 * e muito desigual (a maior tem 59 nos, a cauda tem 1). Este script le a
 * contagem ja renderizada em cada linha e escreve --tsz-ref (0..1); theme.css
 * desenha a barra. Nada de novo e inventado: a barra mostra o numero que ja
 * esta na tela.
 *
 * O studio e Svelte e re-renderiza a lista ao filtrar/selecionar, entao um
 * MutationObserver reaplica. As escritas do proprio script sao ignoradas para
 * nao realimentar o observer.
 */
(() => {
  'use strict';

  const MIN_RATIO = 0.015; // cauda longa continua visivel
  let timer = null;
  let writing = false;

  function countOf(row) {
    const badge = row.querySelector('.st-badge');
    if (!badge) return null;
    const n = parseInt(badge.textContent.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }

  function paint() {
    timer = null;
    writing = true;
    try {
      // A lista e um <ul> com <li> intermediarios: as linhas nao sao filhas
      // diretas, entao a busca precisa ser em profundidade.
      for (const list of document.querySelectorAll('.rail-comm-list, .rail-list')) {
        const rows = [...list.querySelectorAll('.st-selectableRow')];
        // Somente a lista de comunidades: e a que carrega rail-comm-lead.
        if (!rows.some((r) => r.querySelector('.rail-comm-lead'))) continue;

        const counts = rows.map(countOf);
        const max = Math.max(...counts.filter((n) => n !== null), 0);
        if (!max) continue;

        rows.forEach((row, i) => {
          const n = counts[i];
          if (n === null) {
            row.style.removeProperty('--tsz-ref');
            return;
          }
          const ratio = Math.max(n / max, MIN_RATIO).toFixed(4);
          if (row.style.getPropertyValue('--tsz-ref') !== ratio) {
            row.style.setProperty('--tsz-ref', ratio);
          }
        });
      }
    } finally {
      writing = false;
    }
  }

  /*
   * setTimeout e nao requestAnimationFrame de proposito: rAF fica congelado
   * enquanto a aba nao compoe frames (segundo plano, janela oculta), e ai a
   * regua nunca aparecia depois que o Svelte montava a lista.
   */
  function schedule() {
    if (timer !== null || writing) return;
    timer = setTimeout(paint, 32);
  }

  function start() {
    paint();
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
