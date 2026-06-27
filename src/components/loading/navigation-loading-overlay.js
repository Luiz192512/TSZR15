"use client";

import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { Tszr15Loader } from "./tszr15-loader.js";

function isInternalNavigationLink(anchor) {
  if (!anchor?.href || anchor.target || anchor.hasAttribute("download")) {
    return false;
  }

  const nextUrl = new URL(anchor.href, window.location.href);
  const currentUrl = new URL(window.location.href);

  if (nextUrl.origin !== currentUrl.origin) {
    return false;
  }

  const onlyHashChanged =
    nextUrl.pathname === currentUrl.pathname &&
    nextUrl.search === currentUrl.search &&
    nextUrl.hash !== currentUrl.hash;

  return !onlyHashChanged && nextUrl.href !== currentUrl.href;
}

export function NavigationLoadingOverlay() {
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setIsLoading(false);
    delete document.documentElement.dataset.navigationLoading;
    window.clearTimeout(timeoutRef.current);
  }, [pathname]);

  useEffect(() => {
    function stopLoading() {
      setIsLoading(false);
      delete document.documentElement.dataset.navigationLoading;
    }

    function startLoading() {
      document.documentElement.dataset.navigationLoading = "true";
      setIsLoading(true);
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(stopLoading, 5200);
    }

    function handleClick(event) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = event.target.closest?.("a[href]");

      if (isInternalNavigationLink(anchor)) {
        startLoading();
      }
    }

    function handleSubmit(event) {
      const form = event.target;

      if (form?.tagName === "FORM" && form.method.toLowerCase() !== "dialog") {
        startLoading();
      }
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("popstate", startLoading);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("popstate", startLoading);
      delete document.documentElement.dataset.navigationLoading;
      window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden={!isLoading}
      aria-live="polite"
      className={cx(globalStyles, `navigation-loading-overlay ${isLoading ? "is-visible" : ""}`)}
      role="status"
    >
      <Tszr15Loader label="Carregando proxima tela" />
    </div>
  );
}
