/**
 * Cloudflare Worker — LINE Notify Relay
 * Deploy ที่ workers.cloudflare.com (ฟรี 100,000 req/วัน)
 *
 * วิธี deploy:
 *  1. เปิด https://workers.cloudflare.com  → Sign in / สมัครฟรี
 *  2. Dashboard → Workers & Pages → Create Worker
 *  3. วาง code นี้ลงใน editor แล้วกด Deploy
 *  4. Copy URL ของ Worker (เช่น https://line-relay.YOUR-NAME.workers.dev)
 *  5. วาง URL นั้นใน Settings → LINE Relay Webhook URL
 *
 * Request format (JSON POST):
 *   { token: "LINE_NOTIFY_TOKEN", message: "ข้อความ", imageUrl: "https://..." | null }
 */

const ALLOWED_ORIGIN = '*'; // เปลี่ยนเป็น domain จริงเพื่อความปลอดภัย เช่น 'https://your-app.vercel.app'

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResp({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const { token, message, imageUrl } = body;
    if (!token || !message) {
      return jsonResp({ ok: false, error: 'token and message are required' }, 400);
    }

    // Forward to LINE Notify
    const fd = new FormData();
    fd.append('message', message);
    if (imageUrl) {
      fd.append('imageFullsize', imageUrl);
      fd.append('imageThumbnail', imageUrl);
    }

    let lineRes;
    try {
      lineRes = await fetch('https://notify-api.line.me/api/notify', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd,
      });
    } catch (err) {
      return jsonResp({ ok: false, error: 'LINE API unreachable: ' + err.message }, 502);
    }

    const lineBody = await lineRes.text().catch(() => '');
    if (!lineRes.ok) {
      return jsonResp({ ok: false, error: 'LINE error ' + lineRes.status, detail: lineBody }, lineRes.status);
    }

    return jsonResp({ ok: true, status: lineRes.status });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
