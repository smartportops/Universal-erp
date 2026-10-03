import { NextResponse, type NextRequest } from "next/server";

// Visitors without a session see the marketing page at "/";
// signed-in users keep the dashboard there.
export function proxy(request: NextRequest) {
  if (request.cookies.has("aera_session")) return NextResponse.next();
  return NextResponse.rewrite(new URL("/home", request.url));
}

export const config = {
  matcher: "/",
};
