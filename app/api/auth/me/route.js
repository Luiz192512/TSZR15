import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/src/lib/supabase/server.js";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate"
};

function toHeaderUser(user) {
  if (!user) {
    return null;
  }

  return {
    email: user.email ?? "",
    id: user.id,
    user_metadata: {
      full_name: user.user_metadata?.full_name ?? ""
    }
  };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ authenticated: false, user: null }, { headers: noStoreHeaders });
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  return NextResponse.json(
    {
      authenticated: Boolean(user && !error),
      user: error ? null : toHeaderUser(user)
    },
    { headers: noStoreHeaders }
  );
}
