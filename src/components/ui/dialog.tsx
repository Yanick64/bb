import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
  sheet = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  sheet?: boolean;
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`dialog-content ${wide ? "dialog-wide" : ""} ${sheet ? "dialog-sheet" : ""}`}
          aria-describedby={description ? undefined : undefined}
        >
          <header className="dialog-heading">
            <div>
              <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className={description ? "muted" : "sr-only"}>
                {description ?? title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Sluiten">
                <X size={18} />
              </Button>
            </DialogPrimitive.Close>
          </header>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
