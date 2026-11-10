# DesignDesk AI

**AI design ordering assistant for freelance design services.**

DesignDesk AI turns a validated freelance workflow — selling AI-assisted design
services on marketplaces — into a product anyone can use: a client submits a
brief, gets a **fixed USD quote in seconds**, sees an **AI-generated draft
concept**, pays with **PayPal**, and tracks the order until the final artwork is
delivered. No chat negotiation, no vague pricing, no payment chasing.

Built for the **PayPal AI Hackathon** (PayPal sandbox + AI image generation).

## The flow

```
Client brief ──▶ Instant quote engine ──▶ AI draft concept
      ──▶ Client approves ──▶ PayPal sandbox checkout ──▶ Paid
      ──▶ Studio delivers ──▶ Client downloads final design
```

Order status is tracked end-to-end:
`Created → Draft ready → Awaiting payment → Paid → Delivered`.

## Features

- **Brief intake** — design type (Logo / Poster / Product image / Avatar /
  Social media kit), free-text brief, style preference, email.
- **Transparent pricing engine** — deterministic quote with an itemised
  breakdown (see *Pricing logic* below). The quote is shown live while typing.
- **AI draft generation** — an OpenAI-compatible Images API when a key is
  configured; otherwise a programmatic SVG draft rendered from the brief
  (palette, keywords and layout derived from the order — never a blank image).
- **PayPal Checkout (Orders v2)** — real sandbox orders with approve/capture
  flow when credentials are configured.
- **Order tracking page** — status timeline, draft preview, contextual actions
  (approve → pay → deliver → download).
- **Zero dependencies** — plain Node.js `http` server + vanilla HTML/CSS/JS.
  `npm start` is all you need.

## Quick start

```bash
npm install   # no dependencies — this is a no-op sanity step
npm start     # → http://localhost:3000
```

Requires Node.js ≥ 18. Open the page, submit a brief, and walk the order
through to delivery. With no environment variables set, the app runs in
**demo mode** (see below) and the full flow still works end-to-end.

## Configuration

Copy `.env.example` to `.env` and fill in what you have. Everything is
optional; each integration degrades gracefully and independently.

| Variable | Purpose |
| --- | --- |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal app credentials. Enables real sandbox checkout. |
| `PAYPAL_ENV` | `sandbox` (default) or `live`. |
| `IMAGE_API_KEY` | Key for an OpenAI-compatible Images API. Enables AI drafts. |
| `IMAGE_API_BASE` | Images API base URL (default `https://api.openai.com/v1`). |
| `IMAGE_MODEL` | Image model name (default `gpt-image-1`). |
| `PORT` | Server port (default `3000`). |
| `PUBLIC_BASE_URL` | Public URL of this server, used for PayPal return/cancel redirects. |

### PayPal sandbox setup

1. Go to [developer.paypal.com](https://developer.paypal.com) → **Apps &
   Credentials** → **Sandbox** → **Create App**.
2. Copy the **Client ID** and **Secret** into `.env` as above, with
   `PAYPAL_ENV=sandbox`.
3. Restart the server. The header badge switches to **PAYPAL SANDBOX**, and the
   Pay button now redirects to a real PayPal sandbox checkout. Pay with any
   sandbox buyer account from the developer dashboard.
4. On approval, PayPal redirects back to `/paypal/return`, the server captures
   the order via the Orders v2 API, and the order flips to **Paid**.

## Demo mode

Demo mode exists so judges (and anyone cloning the repo) can run the complete
flow with zero setup:

- **No PayPal credentials** → the checkout step is a clearly labelled
  **SANDBOX DEMO MODE** simulated payment page. Clicking *Pay* advances the
  order through the same status flow. Nothing about it pretends to be real.
- **No image API key** (or the API errors) → drafts are generated
  programmatically as styled SVG artwork derived from the brief, badged
  **DEMO MODE** in the UI.

## Pricing logic

Prices are fixed in code (`lib/quote.js`) and fully deterministic:

- **Base price by type** — Logo $49 · Poster $39 · Product image $29 ·
  Avatar $19 · Social media kit $79.
- **Complexity** — by brief length (≤15 words ×1.0 · 16–40 ×1.25 · >40 ×1.6),
  plus +15% per complexity keyword (`detailed`, `mascot`, `3d`, …), capped +45%.
- **Style premium** — Minimal/Modern ×1.0 · Playful/Vintage ×1.1 ·
  Luxury ×1.3 · 3D render ×1.4.
- **Rush fee** — +50% if the brief asks for rush/urgent/ASAP delivery.

Every quote response includes the itemised breakdown the client sees.

## Architecture

```
server.js          Zero-dependency HTTP server, routing, PayPal return handlers
lib/quote.js       Deterministic pricing engine
lib/draft.js       Image API client + programmatic SVG draft fallback
lib/paypal.js      PayPal OAuth + Orders v2 (create / capture)
lib/store.js       JSON-file order store (data/orders.json)
public/            Vanilla front end (index.html, style.css, app.js)
data/drafts/       Generated draft/final artwork files
```

State is kept in a local JSON file — intentionally no database, so the demo is
trivial to run, inspect and reset (delete `data/orders.json`).

## API summary

| Endpoint | Description |
| --- | --- |
| `POST /api/orders` | Create order from a brief → quote + draft, status `draft_ready` |
| `POST /api/quote` | Price a brief without creating an order |
| `GET /api/orders/:id` | Order detail / tracking |
| `GET /api/orders/:id/draft` | Draft artwork |
| `POST /api/orders/:id/approve` | Client approves draft → `awaiting_payment` |
| `POST /api/orders/:id/pay` | Create PayPal sandbox order → approval URL |
| `POST /api/orders/:id/pay/demo-confirm` | Demo-mode payment (only when no PayPal credentials) |
| `POST /api/orders/:id/deliver` | Studio delivery action (requires `paid`) |
| `GET /api/orders/:id/download` | Download final design (requires `delivered`) |

## License

MIT — see [LICENSE](LICENSE).
