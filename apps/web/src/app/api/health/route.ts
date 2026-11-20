import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Health check failed:", (err as Error).name);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
