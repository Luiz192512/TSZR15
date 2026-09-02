"use client";

import { useEffect, useState } from "react";

import styles from "./theme-toggle.module.css";
import { THEME_DARK, THEME_LIGHT, THEME_STORAGE_KEY } from "./theme-script.js";

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    return stored === THEME_DARK || stored === THEME_LIGHT ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? THEME_DARK : THEME_LIGHT;
}

export function ThemeToggle() {
  // Começa nulo de propósito: no servidor não dá para saber o tema do
  // visitante, e chutar aqui produziria HTML diferente do cliente.
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(readStoredTheme() ?? systemTheme());
  }, []);

  // Sem escolha salva, a preferência do sistema continua mandando — inclusive
  // se o visitante trocar o tema do sistema com a aba aberta.
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");

    if (!query) {
      return undefined;
    }

    const onChange = () => {
      if (!readStoredTheme()) {
        setTheme(systemTheme());
      }
    };

    query.addEventListener("change", onChange);

    return () => query.removeEventListener("change", onChange);
  }, []);

  function applyTheme(next) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Navegação privada com storage bloqueado: o tema vale só nesta página.
    }
  }

  const isDark = theme === THEME_DARK;
  const label = isDark ? "Mudar para tema claro" : "Mudar para tema escuro";

  return (
    <button
      aria-label={label}
      aria-pressed={isDark}
      className={styles.toggle}
      onClick={() => applyTheme(isDark ? THEME_LIGHT : THEME_DARK)}
      title={label}
      type="button"
    >
      <span aria-hidden="true" className={styles.icon}>
        {/* theme === null no primeiro render: sem ícone, sem palpite errado. */}
        {theme === null ? "" : isDark ? "☀" : "☾"}
      </span>
    </button>
  );
}
