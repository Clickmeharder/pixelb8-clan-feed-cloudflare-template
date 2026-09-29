# PixelB8 Clan Feed

A tiny self-hosted realtime relay for the PixelB8 OSRS Clan Feed.

Each deployment belongs to one clan and runs in that clan owner's own Cloudflare account. Clan chat is relayed live through WebSockets and is **not permanently stored**.

## Deploy

Clan owners can deploy this template to their own Cloudflare account:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Clickmeharder/pixelb8-clan-feed-cloudflare-template)

During deployment, Cloudflare will ask for `CLAN_FEED_KEY`.

Paste one of the clan keys generated in your PixelB8 Clan Owner Office. Keep this value private. RuneLite must use the same key when publishing the Clan Feed.

## After deployment

Open the deployed Worker URL in a browser. It returns the two URLs you need:

- `viewerUrl` — save this in the PixelB8 Owner Office as the clan's **Shared Clan Feed WebSocket URL**.
- `runeliteUrl` — put this in RuneLite's **Clan Feed WebSocket URL** setting.

RuneLite's **Clan Feed Key** must be the same key you entered as `CLAN_FEED_KEY` during deployment.

Example:

```text
Website viewer URL:
wss://your-worker.workers.dev/viewer

RuneLite publisher URL:
wss://your-worker.workers.dev/runelite
```

## What it relays

The relay accepts authenticated RuneLite publisher connections and forwards these PixelB8 event types to connected website viewers:

- `clan_chat`
- `clan_system`
- `test`

Website viewer connections are receive-only.

## Privacy and storage

This template does not write clan-feed messages to Durable Object storage. Messages are relayed only to viewers who are connected at that moment. If nobody is viewing the feed, incoming messages are discarded after processing.

The Durable Object uses Cloudflare's Hibernation WebSocket API so idle WebSocket rooms can sleep while connections remain open.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Then edit `.dev.vars` and replace the placeholder with a real clan key.
