# PixelB8 Clan Feed

A tiny self-hosted realtime relay for PixelB8-compatible OSRS clan feeds.

Each deployment belongs to one clan and runs in that clan owner's own Cloudflare account. Clan feed events are relayed live through WebSockets and are **not permanently stored**. PixelB8 can use the feed, but the relay is not restricted to PixelB8: the clan owner can also connect from their own website, overlay, or the included standalone viewer.

## Deploy

Clan owners can deploy this template to their own Cloudflare account:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Clickmeharder/pixelb8-clan-feed-cloudflare-template)

During deployment, Cloudflare asks for two secrets:

- `CLAN_FEED_KEY` — the Publisher Key used by RuneLite to publish feed events.
- `CLAN_VIEWER_KEY` — the Viewer Code used to obtain short-lived read-only viewer tokens.

These values can come from either a registered PixelB8 Clan Owner Office or a Local Clan Owner Office. Keep both private.

## After deployment

Open the deployed Worker URL in a browser. It returns the endpoints for that deployment:

- `viewerUrl` — `wss://.../viewer`
- `viewerTokenUrl` — `https://.../viewer-token`
- `runeliteUrl` — `wss://.../runelite`

RuneLite uses `runeliteUrl` plus the same Publisher Key entered as `CLAN_FEED_KEY`.

A browser viewer submits the Viewer Code to `POST /viewer-token`. If it matches `CLAN_VIEWER_KEY`, the Worker returns a short-lived token. The viewer then connects to `viewerUrl?token=...`. Direct anonymous `/viewer` connections are rejected.

## Optional standalone viewer

This template includes a standalone read-only Clan Feed Viewer in `docs/index.html`. Hosting the viewer is optional. It connects directly to the clan owner's Cloudflare Worker.

To publish your own viewer with GitHub Pages:

1. Open your GitHub repository.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch.
5. Select the `/docs` folder.
6. Save the Pages settings.
7. Open the GitHub Pages URL after the deployment finishes.

Your viewer will normally be available at:

`https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPOSITORY-NAME/`

Enter your Cloudflare Worker URL and Viewer Code, then press **Connect**.

The Worker allows `/viewer-token` requests from any browser origin, but a valid Viewer Code is still required and `/viewer` still requires a short-lived signed token.

## What it relays

The relay accepts authenticated RuneLite publisher connections and forwards these event types to connected viewers:

- `clan_chat`
- `clan_system`
- `test`

Website viewer connections are receive-only.

## Privacy and storage

This template does not write clan-feed messages to Durable Object storage. Messages are relayed only to viewers who are connected at that moment. If nobody is viewing the feed, incoming messages are discarded after processing.

The Durable Object uses Cloudflare's Hibernation WebSocket API so idle WebSocket rooms can sleep while connections remain open.

Cloudflare secrets are not revealable after they are stored. If an owner changes a Publisher Key or Viewer Code, use Cloudflare's **Rotate** action to replace the matching Worker secret.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

Then set both `CLAN_FEED_KEY` and `CLAN_VIEWER_KEY` in `.dev.vars`.
