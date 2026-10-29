# Teamleader Orbit ticket webhooks

## Receiver

```text
POST https://YOUR_BB_HOST/api/webhooks/orbit
Content-Type: application/json
Authorization: Bearer YOUR_BB_ORBIT_WEBHOOK_SECRET
```

Set `BB_ORBIT_WEBHOOK_SECRET` on the BB server. For HMAC authentication instead, set `X-BB-Signature` to `sha256=` followed by the hex HMAC-SHA256 of the exact request body using that secret.

This receiving secret is separate from Teamleader Orbit OAuth credentials.

## Public webhook with a local UI

Use Tailscale Funnel when the sender is outside the tailnet. Tailscale Serve alone is not public. Preserve existing routes and add the webhook on an available Funnel HTTPS port:

```sh
tailscale funnel --bg --https=10000 --set-path=/api/webhooks/orbit http://127.0.0.1:4310/api/webhooks/orbit
```

Use the hostname printed by Tailscale:

```dotenv
BB_WEBHOOK_URL=https://YOUR_NODE.YOUR_TAILNET.ts.net:10000/api/webhooks/orbit
BB_ORBIT_WEBHOOK_SECRET=YOUR_SEPARATE_RANDOM_SECRET
```

Restart the full BB process after changing `.env`; watch reloads can retain inherited environment values. This URL permits only webhook POST requests on the public host. It does not change the UI URL or OAuth callbacks. Keep BB and Tailscale running to receive deliveries.

Every connection has a **Verbinding controleren** action. The webhook check sends an authenticated `{ "probe": "<uuid>" }` challenge and verifies its response. Probes create neither receipts nor tasks. This verifies transport and authentication, not sender-side forwarding.

BB persists the receipt and returns HTTP 202 with `receiptId` and `status`. Duplicate bodies return the existing receipt. Task creation is independently deduplicated by the Orbit ticket ID, so different deliveries about the same ticket cannot create duplicate tasks.

## Minimal payload

```json
{
  "ticketId": "TC0000000000001"
}
```

This is a synthetic ID illustrating the shape, not a real ticket. The processor calls `GetTicketDetail` using the configured Orbit MCP connection. Recognized alternatives are `ticket_id`, `api_id` and `data.ticketId`.

The existing sender's payload has not been captured yet. These are BB's accepted shapes, not a claim about the sender's actual schema. Unrecognized JSON remains in **Verbindingen → Ontvangen webhooks** with status `needs_mapping`. You can inspect it and supply the actual ticket API ID.

## Normalized forwarding payload

A trusted existing receiver that already resolves the ticket can send:

```json
{
  "provider": "orbit",
  "externalId": "TC0000000000001",
  "externalProjectId": "PR0000000000001",
  "title": "Customer question",
  "body": "The ticket description",
  "client": "Example client",
  "url": ""
}
```

This form works without an additional Orbit lookup. A selected external project determines the BB project. Missing or unmatched projects send the task to the shared inbox.

## Reusing an existing receiver

The existing private webhook URL is not stored in this repository. It belongs to a different receiver. Configure that receiver to forward its event to the BB endpoint, with the BB bearer token or HMAC signature, or change the sender's destination.

BB does not call the old receiver URL and does not modify its configuration. Reaching a receiver is not the same as subscribing to its event stream.

Before forwarding real traffic:

1. Keep BB running and expose the webhook through HTTPS.
2. Set `BB_WEBHOOK_URL` and `BB_ORBIT_WEBHOOK_SECRET`. For a public UI as well, set `BB_PUBLIC_URL` and `BB_PASSWORD`.
3. Forward one real event and inspect its receipt.
4. Confirm its ticket ID and project mapping.
5. Send the same event again and confirm there is still one task.

Failed enrichment stays visible with its error. Automatic retries of failed receipts are deliberately absent until the provider's retry timing is available. The receipt inbox is bounded to 1,000 entries; archival/retention is follow-up work before sustained production traffic.
