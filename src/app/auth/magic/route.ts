import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { consumeMagicLink } from "@/lib/auth/magic-link";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const token = request.nextUrl.searchParams.get("token") || "";
  const origin = request.nextUrl.origin;
  try {
    await consumeMagicLink(token);
    return NextResponse.redirect(new URL("/", origin));
  } catch (err) {
    const login = new URL("/login", origin);
    login.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Login fehlgeschlagen",
    );
    return NextResponse.redirect(login);
  }
}
