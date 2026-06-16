"use client";

/**
 * 客户端登录态判断（国内可靠版）。
 *
 * 不要用 supabaseBrowser().auth.getSession() 来判断是否登录——
 * 它依赖浏览器持久化的 Supabase session，而国内直连 Supabase（新加坡）
 * 常失败/超时，会把已登录用户误判为未登录。
 *
 * 改为问服务端：当前设备 id 对应的 profile 是否已绑定账号（有用户名/邮箱）。
 * 登录后 device id 已被切换为账号统一 id（见 lib/device-id.ts setDeviceId），
 * 所以这里能稳定反映真实登录态。
 */
export async function fetchLoginState(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  // 只认已存在的设备 id；全新访客（无 id）直接视为未登录，避免自动建档
  const id = localStorage.getItem("qiuyi_device_id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return false;
  try {
    const res = await fetch("/api/account/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: id }),
    });
    const data = await res.json();
    return !!(data.ok && (data.account?.username || data.account?.email));
  } catch {
    return false;
  }
}
