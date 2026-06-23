import globalStyles from "@/app/storefront.module.css";
import { cx } from "@/src/lib/classnames";
export function CartIcon({ className = "cart-link-icon" }) {
  return (
    <svg
      aria-hidden="true"
      className={cx(globalStyles, className)}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3 4h2.6l2.1 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H7" />
      <path d="M9.5 20h.01" />
      <path d="M17.5 20h.01" />
    </svg>
  );
}
