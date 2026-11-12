# CDE Imports — WhatsApp Group Worker (experimental)

**Status: code scaffold only; not installed, connected, deployed, or tested against a live WhatsApp group.** This is **unofficial WhatsApp Web automation**, not the Meta WhatsApp Business API nor an mLabs feature. It risks account restrictions or a ban. Use only with informed consent and avoid unsolicited messages.

## Why isolated?

The existing GitHub Pages frontend and Render backend are left unchanged. This worker runs on a **private, persistent computer/server** with Chromium. Render free web services or GitHub Pages cannot provide a reliable persistent WhatsApp Web session. Do **not** deploy this worker to a public endpoint or save its session files in a public repository.

## Installation (not executed)

1. Install Node.js 20+, Chromium dependencies and npm on a private machine.
2. From `whatsapp-worker/`, run `npm install`. This installs Puppeteer through whatsapp-web.js.
3. Copy `.env.example` to `.env`; generate a random administrative token with 32+ characters.
4. Leave `WA_CONNECT_ENABLED=false` and `WA_SEND_ENABLED=false` until explicit authorization.
5. Start with `npm start`. Only localhost is accepted by default.

## Enabling, later, with new authorization

1. Turn **only** `WA_CONNECT_ENABLED=true`; keep `WA_SEND_ENABLED=false`.
2. Call `POST /v1/connect` using `Authorization: Bearer <WA_ADMIN_TOKEN>`.
3. Retrieve `GET /v1/qr` to display the QR on a **private admin UI**, then scan it as a linked device from the WhatsApp Business app. Never log, publish, or send a QR or session credentials to others.
4. When `GET /v1/status` shows `ready`, `GET /v1/groups` lists accessible groups. Copy **only the target group ID** (format `12345@g.us`) to `WA_ALLOWED_GROUP_IDS` in `.env`; restart. **An invitation URL is not a group ID.**
5. Submit a `POST /v1/preview` request to validate payload; no send.
6. Only after separate explicit authorization and controlled testing, manually set `WA_SEND_ENABLED=true` and restart.
7. Then `POST /v1/send` can deliver a **text-only message** to the allowlisted group.

### Send request

```json
{
  "groupId": "123456789@g.us",
  "message": "🔥 Oferta CDE Imports! Produto, preço, cupom e checkout: https://cdeimports.site/",
  "idempotencyKey": "shopify-product123-campaign001"
}
```

This module requires an administrator bearer token on all `/v1` routes. `GET /health` exposes no QR, tokens, contacts, or group names. The `idempotencyKey` avoids repeat sends *after a recorded successful send*. Network interruptions can make delivery ambiguous; manually verify before retrying.

**Not implemented:** Shopify OAuth/webhooks, automatic catalog synchronization, media/image upload, remote access, a live delivery queue, and unattended posting schedules. Those are later development tasks. The worker is not connected to the Social Studio frontend, and no messages are sent just by committing this code.

## Security warnings

- Keep the worker on localhost or behind authenticated private networking; never expose its port, QR, or session directory publicly.
- Sessions are stored in the configured local `private-data/session` directory. Back them up only securely.
- Add opt-in, frequency limits, audit logs, and human review before production sending.
- Respect WhatsApp Terms and Meta restrictions. For production stability, prefer a supported, official channel whenever the target permits it.
