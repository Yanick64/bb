import type { Project } from "./domain";

export function senderAddress(from: string) {
  const value = from.match(/<([^<>]+)>\s*$/)?.[1] ?? from.trim();
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) ? value.toLowerCase() : "";
}

export function mailProjects(projects: Project[], from: string) {
  const address = senderAddress(from);
  if (!address) return [];
  const exact = projects.filter((project) => project.mailSenders.includes(address));
  if (exact.length) return exact;
  const domain = address.slice(address.lastIndexOf("@"));
  return projects.filter((project) => project.mailSenders.includes(domain));
}
