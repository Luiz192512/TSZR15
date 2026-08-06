import { redirect } from "next/navigation";

import { resolveAdminSectionRedirect } from "@/src/admin/admin-section-paths.js";

export default async function AdminIndexPage({ searchParams }) {
  const params = await searchParams;

  redirect(resolveAdminSectionRedirect(params));
}
