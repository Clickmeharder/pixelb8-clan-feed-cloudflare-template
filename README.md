# PixelB8 Clan Feed

A tiny self-hosted realtime relay for the PixelB8 OSRS Clan Feed.

Each deployment belongs to one clan and runs in that clan owner's own Cloudflare account. Clan chat is relayed live through WebSockets and is **not permanently stored**.

## Deploy

Once this repository is public on GitHub, this button can be used by clan owners:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=REPLACE_WITH_PUBLIC_GITHUB_REPO_URL)

During deployment, set:

- `CLAN_FEED_KEY` to one of the clan keys generated in your PixelB8 Clan Owner Office. RuneLite uses this to publish the feed.
- `CLAN_VIEWER_KEY` to the Clan Feed Viewer Code generated in your PixelB8 Clan Owner Office. Clanmates use this for read-only access.

Keep both values private.

## After deployment

Open the deployed Worker URL in a browser. It returns the two URLs you need:

- `viewerUrl` — save this in the PixelB8 Owner Office as the clan's **Shared Clan Feed WebSocket URL**.
- `runeliteUrl` — put this in RuneLite's **Clan Feed WebSocket URL** setting.

RuneLite's **Clan Feed Key** must be the same key you entered as `CLAN_FEED_KEY` during deployment.

The PixelB8 website asks clan members for the Viewer Code, exchanges it for a short-lived viewer token, then connects to the saved `viewerUrl`.

Example:

```text
Website viewer URL:
wss://your-worker.workers.dev/viewer

RuneLite publisher URL:
wss://your-worker.workers.dev/runelite
```

## What it relays

The relay accepts authenticated RuneLite publisher connections and forwards these PixelB8 event types to authenticated website viewers:

- `clan_chat`
- `clan_system`
- `test`

Website viewer connections are receive-only.

## Privacy and storage

This template does not write clan-feed messages to Durable Object storage. Messages are relayed only to viewers who are connected at that moment. If nobody is viewing the feed, incoming messages are discarded after processing.

The Durable Object uses Cloudflare's Hibernation WebSocket API so idle WebSocket rooms can sleep while connections remain open.

The saved viewer WebSocket URL alone is not enough to read the feed. A valid short-lived viewer token is required, and that token is issued only after the correct `CLAN_VIEWER_KEY` is supplied.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Then edit `.dev.vars` and add a real clan key and Viewer Code.
