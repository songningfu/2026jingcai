import { NextResponse } from "next/server";

// 占位（并行会话开发中）。空文件会导致构建失败，先放一个合法模块兜底。
export async function GET() {
  return NextResponse.json({ ok: true, matches: [] });
}
