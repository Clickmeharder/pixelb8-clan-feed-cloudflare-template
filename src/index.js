import { DurableObject } from "cloudflare:workers";

const MAX_MESSAGE_BYTES = 16 * 1024;
const ALLOWED_EVENT_TYPES = new Set(["clan_chat", "clan_system", "test"]);

function websocketResponse(client) {
  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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

    if (url.pathname === "/" || url.pathname === "/health") {
      const wsBase = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
      return jsonResponse({
        ok: true,
        service: "PixelB8 Clan Feed Relay",
        viewerUrl: `${wsBase}/viewer`,
        runeliteUrl: `${wsBase}/runelite`,
        persistence: "none",
      });
    }

    if (url.pathname !== "/viewer" && url.pathname !== "/runelite") {
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }

    const room = env.CLAN_FEED_ROOM.getByName("feed");
    return room.fetch(request);
  },
};
