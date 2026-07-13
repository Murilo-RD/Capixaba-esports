// Server-only Gmail send helper. Configure EMAIL_GATEWAY_URL and credentials;
// if they are missing, email sends are skipped.
const FROM = process.env.EMAIL_FROM ?? "Capixaba Esports <capixabaesportsofc@gmail.com>";

function b64url(input: string): string {
  const b = Buffer.from(input, "utf-8").toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRawEmail(to: string, subject: string, html: string): string {
  const boundary = "b_" + Math.random().toString(36).slice(2);
  const headers = [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const body = [
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html.replace(/<[^>]+>/g, ""),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return b64url(headers + "\r\n" + body);
}

export async function sendGmail(to: string, subject: string, html: string): Promise<void> {
  const gatewayUrl = process.env.EMAIL_GATEWAY_URL;
  const gatewayBearer = process.env.EMAIL_GATEWAY_BEARER;
  const connectionKey = process.env.EMAIL_CONNECTION_API_KEY;
  if (!gatewayUrl || !gatewayBearer || !connectionKey) {
    console.warn("[email] Missing gateway keys; skipping send to", to);
    return;
  }
  const raw = buildRawEmail(to, subject, html);
  const res = await fetch(`${gatewayUrl}/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${gatewayBearer}`,
      "X-Connection-Api-Key": connectionKey,
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`[email] Gmail send failed [${res.status}] to ${to}: ${t}`);
    throw new Error(`Gmail send failed: ${res.status} ${t}`);
  }
}

export function wrapHtml(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#0b0b12;color:#eaeaf0;margin:0;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#14141d;border-radius:12px;padding:24px;border:1px solid #23233a">
      <h2 style="margin:0 0 12px;color:#7c5cff">${title}</h2>
      ${bodyHtml}
      <hr style="border:none;border-top:1px solid #23233a;margin:24px 0"/>
      <p style="font-size:12px;color:#8a8aa0;margin:0">Capixaba Esports · notificação automática</p>
    </div>
  </body></html>`;
}
