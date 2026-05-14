import { NextRequest, NextResponse } from "next/server";

const PYTHON_API = process.env.PYTHON_PARSE_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const apiUrl = PYTHON_API.replace(/\/+$/, "") + "/api/ai-analyze-parsed";

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
