import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isValidDeviceId } from "@/lib/games";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const BUCKET = "avatars";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const deviceId = form.get("deviceId") as string;
    const file = form.get("file") as File | null;

    if (!isValidDeviceId(deviceId)) {
      return NextResponse.json({ error: "无效的设备标识" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "未收到文件" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "仅支持 JPG/PNG/WebP/GIF" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "图片不能超过 2MB" }, { status: 400 });
    }

    const db = supabaseAdmin();

    // 必须已注册账号才能上传头像
    const { data: profile } = await db
      .from("profiles")
      .select("username")
      .eq("id", deviceId)
      .maybeSingle();
    if (!profile?.username) {
      return NextResponse.json({ error: "请先登录账号再上传头像" }, { status: 403 });
    }
    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const path = `${deviceId}.${ext}`;
    const bytes = await file.arrayBuffer();

    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: file.type, upsert: true });

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(path);

    await db.from("profiles").update({ avatar_url: publicUrl }).eq("id", deviceId);

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "服务异常" },
      { status: 500 },
    );
  }
}
