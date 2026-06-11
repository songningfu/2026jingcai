"use client";

/** 浏览器本地设备身份：首次访问生成 UUID 存 localStorage，作为竞猜游戏的访客身份。 */
const KEY = "qiuyi_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
