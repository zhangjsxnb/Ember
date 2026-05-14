import { NextRequest, NextResponse } from "next/server";

const PYTHON_API = process.env.PYTHON_PARSE_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || (!url.includes("xiaohongshu.com") && !url.includes("xhslink.com"))) {
      return NextResponse.json({ error: "请输入有效的小红书链接" }, { status: 400 });
    }

    const apiUrl = PYTHON_API.endsWith("/api/parse")
      ? PYTHON_API
      : PYTHON_API.replace(/\/+$/, "") + "/api/parse";

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "bypass-tunnel-reminder": "true", // 👈 就是加上这一行，记得末尾有个逗号
    },
      body: JSON.stringify({ url }),
    });

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await res.text();
      console.error("[parse] Non-JSON:", text.substring(0, 300));
      return NextResponse.json({ error: "后端返回非JSON: " + text.substring(0, 150) }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    console.error("[parse] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
