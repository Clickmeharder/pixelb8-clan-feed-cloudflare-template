import { DurableObject } from "cloudflare:workers";

const MAX_MESSAGE_BYTES = 16 * 1024;
const VIEWER_TOKEN_TTL_MS = 10 * 60 * 1000;
const ALLOWED_EVENT_TYPES = new Set(["clan_chat", "clan_system", "test"]);

function websocketResponse(client) {
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function getPublisherKey(request) {
  return String(
    request.headers.get("X-API-Key") ||
      request.headers.get("X-WS-Key") ||
      ""
  ).trim();
}

function safeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));

  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = normalized.padEnd(
    Math.ceil(normalized.length / 4) * 4,
    "="
  );

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function importViewerSigningKey(viewerKey) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(viewerKey || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function createViewerToken(viewerKey) {
  const payload = {
    exp: Date.now() + VIEWER_TOKEN_TTL_MS,
    nonce: crypto.randomUUID(),
  };

  const encodedPayload = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const key = await importViewerSigningKey(viewerKey);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyViewerToken(token, viewerKey) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [encodedPayload, encodedSignature] = parts;

  let payload;
  let signature;

  try {
    payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload))
    );
    signature = base64UrlToBytes(encodedSignature);
  } catch (_) {
    return false;
  }

  if (!payload || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
    return false;
  }

  const key = await importViewerSigningKey(viewerKey);

  return crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(encodedPayload)
  );
}

export class ClanFeedRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;

    // Keep ordinary ping/pong traffic from waking a hibernating room.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request) {
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return jsonResponse({ ok: false, error: "websocket_required" }, 426);
    }

    const url = new URL(request.url);
    const role = url.pathname === "/runelite" ? "publisher" : "viewer";

    if (role === "publisher") {
      const configuredKey = String(this.env.CLAN_FEED_KEY || "").trim();
      const suppliedKey = getPublisherKey(request);

      if (!configuredKey) {
        return jsonResponse(
          { ok: false, error: "publisher_key_not_configured" },
          503
        );
      }

      if (!suppliedKey || !safeEqual(configuredKey, suppliedKey)) {
        return jsonResponse({ ok: false, error: "invalid_publisher_key" }, 401);
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role });

    if (role === "viewer") {
      server.send(
        JSON.stringify({
          type: "pixelb8_feed_status",
          status: "connected",
          timestamp: Date.now(),
        })
      );
    }

    return websocketResponse(client);
  }

  async webSocketMessage(ws, message) {
    const attachment = ws.deserializeAttachment() || {};

    // Viewers are receive-only. Ignore anything they try to send.
    if (attachment.role !== "publisher") {
      return;
    }

    let text;
    if (typeof message === "string") {
      text = message;
    } else if (message instanceof ArrayBuffer) {
      if (message.byteLength > MAX_MESSAGE_BYTES) {
        ws.close(1009, "Message too large");
        return;
      }
      text = new TextDecoder().decode(message);
    } else {
      return;
    }

    if (new TextEncoder().encode(text).byteLength > MAX_MESSAGE_BYTES) {
      ws.close(1009, "Message too large");
      return;
    }

    let event;
    try {
      event = JSON.parse(text);
    } catch (_) {
      return;
    }

    if (!event || typeof event !== "object") {
      return;
    }

    const eventType = String(event.type || "").trim();
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return;
    }

    // Relay RuneLite's JSON unchanged to every connected website viewer.
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === ws) {
        continue;
      }

      const peer = socket.deserializeAttachment() || {};
      if (peer.role !== "viewer") {
        continue;
      }

      try {
        socket.send(text);
      } catch (_) {
        // A closing viewer socket can be ignored; Cloudflare will clean it up.
      }
    }
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch (_) {
      // Already closed.
    }
  }

  async webSocketError(ws) {
    try {
      ws.close(1011, "WebSocket error");
    } catch (_) {
      // Already closed.
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname === "/viewer-token") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      const wsBase = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
      return jsonResponse({
        ok: true,
        service: "PixelB8 Clan Feed Relay",
        viewerUrl: `${wsBase}/viewer`,
        runeliteUrl: `${wsBase}/runelite`,
        viewerAuth: "viewer-code-token",
        persistence: "none",
      });
    }

    if (url.pathname === "/viewer-token") {
      if (request.method !== "POST") {
        return jsonResponse(
          { ok: false, error: "method_not_allowed" },
          405,
          corsHeaders()
        );
      }

      const configuredViewerKey = String(env.CLAN_VIEWER_KEY || "").trim();

      if (!configuredViewerKey) {
        return jsonResponse(
          { ok: false, error: "viewer_key_not_configured" },
          503,
          corsHeaders()
        );
      }

      let body;
      try {
        body = await request.json();
      } catch (_) {
        return jsonResponse(
          { ok: false, error: "invalid_json" },
          400,
          corsHeaders()
        );
      }

      const viewerCode = String(body?.viewerCode || "").trim();

      if (!viewerCode || !safeEqual(configuredViewerKey, viewerCode)) {
        return jsonResponse(
          { ok: false, error: "invalid_viewer_code" },
          401,
          corsHeaders()
        );
      }

      const token = await createViewerToken(configuredViewerKey);

      return jsonResponse(
        {
          ok: true,
          token,
          expiresInMs: VIEWER_TOKEN_TTL_MS,
        },
        200,
        corsHeaders()
      );
    }

    if (url.pathname === "/viewer") {
      const configuredViewerKey = String(env.CLAN_VIEWER_KEY || "").trim();

      if (!configuredViewerKey) {
        return jsonResponse(
          { ok: false, error: "viewer_key_not_configured" },
          503
        );
      }

      const token = String(url.searchParams.get("token") || "").trim();
      const valid = token
        ? await verifyViewerToken(token, configuredViewerKey)
        : false;

      if (!valid) {
        return jsonResponse({ ok: false, error: "invalid_viewer_token" }, 401);
      }
    } else if (url.pathname !== "/runelite") {
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }

    const room = env.CLAN_FEED_ROOM.getByName("feed");
    return room.fetch(request);
  },
};
