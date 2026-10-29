import { ArrowUp, ArrowUpRight, Bug, Circle, Mail, MessageSquare, Radar } from "lucide-react";
import { Children, cloneElement, isValidElement, type ReactNode, useId } from "react";
import type { Source, Task } from "../../shared/domain";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {Children.map(children, (child) =>
        isValidElement<{ id?: string }>(child) &&
        ["input", "textarea", "select"].includes(String(child.type))
          ? cloneElement(child, { id })
          : child,
      )}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Radar size={24} />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function SourceBadge({ source }: { source: Source }) {
  const Icon =
    source === "sentry"
      ? Bug
      : source === "orbit"
        ? Circle
        : source === "email"
          ? Mail
          : MessageSquare;
  return (
    <span className={`source-badge source-${source}`}>
      <Icon size={12} />
      {source === "orbit"
        ? "Teamleader Orbit"
        : source === "sentry"
          ? "Sentry"
          : source === "email"
            ? "Google Mail"
            : "Handmatig"}
    </span>
  );
}
export function Priority({ value }: { value: Task["priority"] }) {
  return (
    <span
      className={`priority priority-${value}`}
      title={
        value === "urgent"
          ? "Urgent"
          : value === "high"
            ? "Hoog"
            : value === "low"
              ? "Laag"
              : "Normaal"
      }
    >
      <ArrowUp size={13} />
      {value === "urgent"
        ? "Urgent"
        : value === "high"
          ? "Hoog"
          : value === "low"
            ? "Laag"
            : "Normaal"}
    </span>
  );
}
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  if (!/^https?:\/\//.test(href)) return <span>{children}</span>;
  return (
    <a className="external-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
export function relativeDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
