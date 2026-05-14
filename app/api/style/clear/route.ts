import { NextResponse } from "next/server";
const PYTHON_API = process.env.PYTHON_PARSE_URL || "http://localhost:8000";
export async function POST() {
  try {
    const res = await fetch(PYTHON_API.replace(/\/+$/, "") + "/api/style/clear", { method: "POST" });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
