import { NextRequest, NextResponse } from "next/server";
const PYTHON_API = process.env.PYTHON_PARSE_URL || "http://localhost:8000";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const res = await fetch(PYTHON_API.replace(/\/+$/, "") + "/api/materials/delete", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
