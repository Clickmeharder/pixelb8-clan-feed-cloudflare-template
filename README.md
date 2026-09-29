# PixelB8 Clan Feed

A tiny self-hosted realtime relay for the PixelB8 OSRS Clan Feed.

Each deployment belongs to one clan and runs in that clan owner's own Cloudflare account. Clan chat is relayed live through WebSockets and is **not permanently stored**.

## Deploy

Once this repository is public on GitHub, this button can be used by clan owners:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=REPLACE_WITH_PUBLIC_GITHUB_REPO_URL)

During deployment Cloudflare requires two secrets:

- `CLAN_FEED_KEY` — one of the clan keys generated in your PixelB8 Clan Owner Office. RuneLite uses this to publish clan-feed events.
- `CLAN_VIEWER_KEY` — the Clan Feed Viewer Code generated in the Owner Office. Clanmates use this for read-only access.

Keep both values private. Do not commit them to GitHub.

## After deployment

Open the deployed Worker URL in a browser. It returns the endpoints used by PixelB8 and RuneLite:

- `viewerUrl` — save this in the PixelB8 Owner Office as the clan's **Shared Clan Feed WebSocket URL**.
- `viewerTokenUrl` — PixelB8 uses this automatically to exchange a valid Viewer Code for a short-lived viewer token.
- `runeliteUrl` — put this in RuneLite's **Clan Feed WebSocket URL** setting.

RuneLite's **Clan Feed Key** must be the same key you entered as `CLAN_FEED_KEY` during deployment.

Example:

```text
Website viewer URL:
wss://your-worker.workers.dev/viewer

Viewer token endpoint:
https://your-worker.workers.dev/viewer-token

RuneLite publisher URL:
wss://your-worker.workers.dev/runelite
```

The raw `/viewer` WebSocket URL is not enough to read the feed. PixelB8 first exchanges the clan's Viewer Code for a short-lived signed token, then connects to `/viewer?token=...`.

Viewer tokens expire after 10 minutes. The website can request a new token whenever it reconnects.

## What it relays

The relay accepts authenticated RuneLite publisher connections and forwards these PixelB8 event types to authenticated website viewers:

- `clan_chat`
- `clan_system`
- `test`

Website viewer connections are receive-only.

## Privacy and storage

This template does not write clan-feed messages to Durable Object storage. Messages are relayed only to viewers who are connected at that moment. If nobody is viewing the feed, incoming messages are discarded after processing.

The Durable Object uses Cloudflare's Hibernation WebSocket API so idle WebSocket rooms can sleep while connections remain open.

The Viewer Code itself is never placed in the WebSocket URL. It is exchanged over HTTPS for a short-lived signed token. Regenerating the Viewer Code and updating `CLAN_VIEWER_KEY` invalidates previously issued tokens after their short expiry window.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Then edit `.dev.vars` and add both a real clan publishing key and a real Viewer Code. Do not commit `.dev.vars`.
