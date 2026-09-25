import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const isOrganizerRoute = pathname.startsWith("/organizer");
  const isRegistrationRoute = pathname === "/organizer/register";
  if (!isOrganizerRoute || isRegistrationRoute) return response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", pathname); return NextResponse.redirect(url);
  }

  let supabaseResponse = response;
  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
        },
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", pathname); return NextResponse.redirect(url);
    }
    return supabaseResponse;
  } catch {
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", pathname); return NextResponse.redirect(url);
  }
}

export const config = { matcher: ["/organizer/:path*"] };
