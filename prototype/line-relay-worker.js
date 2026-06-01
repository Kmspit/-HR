/**
 * Cloudflare Worker — LINE Relay (Notify + Messaging API)
 *
 * Request format (JSON POST):
 *   Messaging API: { accessToken, messages: [{type,text},...] }
 *   LINE Notify:     { token, message, imageUrl }
 */

const ALLOWED_ORIGIN = '*';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return jsonResp({ ok: false, error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResp({ ok: false, error: 'Invalid JSON' }, 400);
    }

    const accessToken = body.accessToken || body.token;
    const messages = body.messages;

    // LINE Messaging API (Channel Access Token)
    if (accessToken && Array.isArray(messages) && messages.length) {
      let lineRes;
      try {
        lineRes = await fetch('https://api.line.me/v2/bot/message/broadcast', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messages }),
        });
      } catch (err) {
        return jsonResp({ ok: false, error: 'LINE API unreachable: ' + err.message }, 502);
      }
      const lineBody = await lineRes.text().catch(() => '');
      if (!lineRes.ok) {
        return jsonResp({ ok: false, error: 'LINE error ' + lineRes.status, detail: lineBody }, lineRes.status);
      }
      return jsonResp({ ok: true, via: 'messaging_api' });
    }

    // LINE Notify (legacy)
    const { message, imageUrl } = body;
    if (!accessToken || !message) {
      return jsonResp({ ok: false, error: 'accessToken+messages or token+message required' }, 400);
    }

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
        headers: { Authorization: 'Bearer ' + accessToken },
        body: fd,
      });
    } catch (err) {
      return jsonResp({ ok: false, error: 'LINE API unreachable: ' + err.message }, 502);
    }

    const lineBody = await lineRes.text().catch(() => '');
    if (!lineRes.ok) {
      return jsonResp({ ok: false, error: 'LINE error ' + lineRes.status, detail: lineBody }, lineRes.status);
    }

    return jsonResp({ ok: true, via: 'line_notify' });
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
