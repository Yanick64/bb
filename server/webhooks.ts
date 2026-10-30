import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { signalInput } from "../shared/domain";
import { requireConnection } from "./connection-state";
import type { Connectors } from "./connectors";
import { AppError, now, type Store } from "./store";
import { ingest } from "./workflow";

export function secureEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function verifyWebhook(
  raw: string,
  secret: string | undefined,
  authorization: string | undefined,
  signature: string | undefined,
) {
  if (!secret) throw new AppError("Webhook is nog niet geconfigureerd", 503);
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (
    !secureEqual(authorization ?? "", `Bearer ${secret}`) &&
    !secureEqual(signature ?? "", expected)
  )
    throw new AppError("Ongeldige webhook-authenticatie", 401);
}
export type Receipt = {
  id: string;
  receivedAt: string;
  status: "pending" | "processed" | "needs_mapping" | "failed";
  payload: unknown;
  taskId: string | null;
  error: string | null;
};
export function receipts(store: Store): Receipt[] {
  return JSON.parse(store.setting("orbit_receipts") ?? "[]");
}
export function receive(store: Store, payload: unknown) {
  const receiptId = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const all = receipts(store);
  const existing = all.find((r) => r.id === receiptId);
  if (existing) return existing;
  if (all.length >= 1000)
    throw new AppError("Webhook-inbox vol. Verwerk of archiveer eerst ontvangen meldingen.", 503);
  const receipt: Receipt = {
    id: receiptId,
    receivedAt: now(),
    status: "pending",
    payload,
    taskId: null,
    error: null,
  };
  all.push(receipt);
  store.setSetting("orbit_receipts", JSON.stringify(all));
  store.changed();
  return receipt;
}
export async function processReceipt(store: Store, connectors: Connectors, receiptId: string) {
  requireConnection(store, "webhook");
  requireConnection(store, "orbit");
  const receipt = receipts(store).find((r) => r.id === receiptId);
  if (!receipt) throw new AppError("Webhook niet gevonden", 404);
  if (receipt.status === "processed") return receipt;
  try {
    const normalized = signalInput.safeParse(receipt.payload);
    let signal: z.infer<typeof signalInput>;
    if (normalized.success && normalized.data.provider === "orbit") signal = normalized.data;
    else {
      const envelope = z
        .object({
          ticketId: z.string().optional(),
          ticket_id: z.string().optional(),
          api_id: z.string().optional(),
          data: z.object({ ticketId: z.string().optional() }).optional(),
        })
        .safeParse(receipt.payload);
      const ticketId = envelope.success
        ? (envelope.data.ticketId ??
          envelope.data.ticket_id ??
          envelope.data.api_id ??
          envelope.data.data?.ticketId)
        : undefined;
      if (!ticketId || !/^TC[A-Z0-9]{13}$/.test(ticketId)) {
        receipt.status = "needs_mapping";
        receipt.error = "Ticket-ID niet herkend. Bekijk de payload en koppel het juiste TC-api_id.";
        saveReceipt(store, receipt);
        return receipt;
      }
      signal = await connectors.ticket(ticketId);
    }
    const result = ingest(store, signal);
    receipt.status = "processed";
    receipt.taskId = result.task.id;
    receipt.error = null;
  } catch (error) {
    receipt.status = "failed";
    receipt.error = error instanceof Error ? error.message : "Verwerking mislukt";
  }
  saveReceipt(store, receipt);
  return receipt;
}
export function saveReceipt(store: Store, receipt: Receipt) {
  store.setSetting(
    "orbit_receipts",
    JSON.stringify(receipts(store).map((r) => (r.id === receipt.id ? receipt : r))),
  );
  store.changed();
}
