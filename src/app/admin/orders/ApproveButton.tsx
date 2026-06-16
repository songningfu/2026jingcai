"use client";
import { useState } from "react";

export default function ApproveButton({ orderId, secret }: { orderId: string; secret: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function approve() {
    setState("loading");
    try {
      const res = await fetch(`/api/admin/approve?secret=${secret}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (data.ok) {
        setState("done");
        setMsg(`已激活，有效期至 ${new Date(data.subExpires).toLocaleDateString("zh-CN")}`);
      } else {
        setState("error");
        setMsg(data.message ?? "操作失败");
      }
    } catch {
      setState("error");
      setMsg("网络错误");
    }
  }

  if (state === "done") return <span className="text-neon text-sm font-semibold">{msg}</span>;
  if (state === "error") return <span className="text-live text-sm">{msg}</span>;

  return (
    <button
      onClick={approve}
      disabled={state === "loading"}
      className="px-4 py-1.5 rounded bg-neon text-white text-sm font-semibold disabled:opacity-50"
    >
      {state === "loading" ? "处理中…" : "✓ 通过并激活"}
    </button>
  );
}
