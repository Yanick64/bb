import { z } from "zod";
import { AppError, type Store } from "./store";

export const connectionId = z.enum(["amp", "orbit", "sentry", "mail", "webhook"]);
export function connectionEnabled(store: Store, id: string) {
  return store.setting(`connection:${id}:disabled`) !== "true";
}
export function requireConnection(store: Store, id: string) {
  if (!connectionEnabled(store, id))
    throw new AppError("Deze verbinding is verwijderd. Verbind opnieuw via Verbindingen.", 409);
}
