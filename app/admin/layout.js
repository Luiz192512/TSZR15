import { redirect } from "next/navigation";

import { isAdminSessionValid, isAdminTokenConfigured } from "@/src/admin/admin-auth.js";

export const metadata = {
  robots: {
    index: false,
    follow: false
  },
  title: "Admin | TSZR15"
};

export default async function AdminLayout({ children }) {
  if (!isAdminTokenConfigured()) {
    redirect("/entrar?next=/admin");
  }

  if (!(await isAdminSessionValid())) {
    redirect("/entrar?next=/admin");
  }

  return children;
}
