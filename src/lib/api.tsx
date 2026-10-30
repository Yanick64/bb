import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { Member, Project, Task } from "../../shared/domain";
export type State = {
  projects: Project[];
  tasks: Task[];
  members: Member[];
  connections: {
    removed: string[];
    orbit: boolean;
    orbitConfigured: boolean;
    orbitOAuth: boolean;
    orbitError: string;
    sentry: boolean;
    sentryMcp: boolean;
    amp: boolean;
    webhook: boolean;
    webhookUrl: string;
    googleMail: { configured: boolean; connected: boolean; email: string };
    publicUrl: string;
    orbitCatalog: { count: number; capturedAt: string } | null;
  };
};
export async function api<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method,
          headers: body instanceof FormData ? {} : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Verzoek mislukt: ${response.status}`);
  return data as T;
}
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={(text, error = false) => setToast({ text, error })}>
      {children}
      <div
        className={`toast ${toast?.error ? "toast-error" : ""}`}
        role="status"
        aria-live="polite"
        hidden={!toast}
      >
        {toast?.text}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function useAction() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ path, body, method }: { path: string; body: unknown; method?: string }) =>
      api(path, body, method),
    onSuccess: () => {
      void client.invalidateQueries();
    },
    onError: (error) => {
      toast(error.message, true);
      void client.invalidateQueries();
    },
  });
}
export function useFactory() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["state"],
    queryFn: () => api<State>("/api/state"),
    staleTime: 5000,
    refetchInterval: 30000,
  });
  const [live, setLive] = useState(false);
  useEffect(() => {
    const events = new EventSource("/api/events");
    events.onopen = () => setLive(true);
    events.onerror = () => setLive(false);
    const onChange = () => {
      void client.invalidateQueries({ queryKey: ["state"] });
      void client.invalidateQueries({ queryKey: ["context"] });
      void client.invalidateQueries({ queryKey: ["receipts"] });
    };
    events.addEventListener("change", onChange);
    return () => events.close();
  }, [client]);
  return { ...query, live };
}
