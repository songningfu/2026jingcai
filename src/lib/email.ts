import "server-only";
import { createHmac, createHash } from "crypto";

const SECRET_ID = process.env.TENCENT_SECRET_ID ?? "";
const SECRET_KEY = process.env.TENCENT_SECRET_KEY ?? "";
const FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "noreply@songningfu.site";
const FROM_NAME = "QiuYi";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "songningfu520@outlook.com";
const REGION = "ap-guangzhou";

function hmac(msg: string, key: Buffer | string) {
  return createHmac("sha256", key).update(msg).digest();
}

async function send(to: string, subject: string, html: string) {
  if (!SECRET_ID || !SECRET_KEY) {
    console.warn("[email] 腾讯云 SES 未配置，跳过发送");
    return;
  }

  const host = "ses.tencentcloudapi.com";
  const action = "SendEmail";
  const version = "2020-10-02";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const service = "ses";

  const payload = JSON.stringify({
    FromEmailAddress: `${FROM_NAME} <${FROM_EMAIL}>`,
    Destination: [to],
    Subject: subject,
    Simple: { Html: Buffer.from(html).toString("base64"), Text: "" },
  });

  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = "content-type;host;x-tc-action";
  const hashedPayload = createHash("sha256").update(payload).digest("hex");
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, hashedPayload].join("\n");

  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonical = createHash("sha256").update(canonicalRequest).digest("hex");
  const stringToSign = ["TC3-HMAC-SHA256", timestamp, credentialScope, hashedCanonical].join("\n");

  const secretDate = hmac(date, `TC3${SECRET_KEY}`);
  const secretService = hmac(service, secretDate);
  const secretSigning = hmac("tc3_request", secretService);
  const signature = createHmac("sha256", secretSigning).update(stringToSign).digest("hex");

  const authorization = `TC3-HMAC-SHA256 Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Host": host,
      "X-TC-Action": action,
      "X-TC-Version": version,
      "X-TC-Region": REGION,
      "X-TC-Timestamp": String(timestamp),
      "Authorization": authorization,
    },
    body: payload,
  });

  const data = await res.json() as { Response?: { Error?: { Code: string; Message: string } } };
  if (data.Response?.Error) {
    console.error("[email] 发送失败", data.Response.Error.Code, data.Response.Error.Message);
  }
}

/** 通知管理员有新订单 */
export async function notifyAdminNewOrder(opts: {
  orderId: string; email: string; plan: string; amount: number; payNote: string;
}) {
  const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://songningfu.site"}/admin/orders`;
  await send(
    ADMIN_EMAIL,
    `[球译] 新订单 · ${opts.plan.toUpperCase()} ¥${opts.amount}`,
    `<p>收到新购买申请：</p>
<ul>
  <li>邮箱：${opts.email}</li>
  <li>套餐：${opts.plan.toUpperCase()}  ¥${opts.amount}</li>
  <li>付款备注：${opts.payNote || "（未填写）"}</li>
  <li>订单 ID：${opts.orderId}</li>
</ul>
<p><a href="${adminUrl}">前往后台审核 →</a></p>`,
  );
}

/** 告知用户订阅已激活 */
export async function notifyUserActivated(opts: {
  email: string; plan: string; subExpires: string;
}) {
  const expires = new Date(opts.subExpires).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
  await send(
    opts.email,
    `[球译] 您的 ${opts.plan.toUpperCase()} 订阅已激活`,
    `<p>您好！</p>
<p>您的球译 <strong>${opts.plan.toUpperCase()}</strong> 订阅已成功激活，有效期至 <strong>${expires}</strong>。</p>
<p>现在可以前往 <a href="https://songningfu.site/deduction">深度推演</a> 享受完整权益。</p>
<p>感谢支持！<br>球译团队</p>`,
  );
}
