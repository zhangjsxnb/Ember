import { NextRequest, NextResponse } from "next/server";

const PYTHON_API = process.env.PYTHON_PARSE_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, mode } = body;

    if (!prompt) {
      return NextResponse.json({ error: "prompt 不能为空" }, { status: 400 });
    }

    // 代理到 Python 后端的 ai-generate 端点
    const apiUrl = PYTHON_API.replace(/\/+$/, "") + "/api/ai-generate";

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, mode: mode || "default" }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
