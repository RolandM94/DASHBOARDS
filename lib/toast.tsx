"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastOptions = {
  position?: string;
  richColors?: boolean;
  closeButton?: boolean;
};

type ToastKind = "success" | "error";

interface ToastMessage {
  id: string;
  kind: ToastKind;
  message: string;
}

const TOAST_EVENT = "eyemark-toast";

function emit(kind: ToastKind, message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastMessage>(TOAST_EVENT, {
    detail: {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      kind,
      message,
    },
  }));
}

export const toast = {
  success(message: string) {
    emit("success", message);
  },
  error(message: string) {
    emit("error", message);
  },
};

export function Toaster({ closeButton = true }: ToastOptions) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    function onToast(event: Event) {
      const toastEvent = event as CustomEvent<ToastMessage>;
      setToasts((current) => [...current, toastEvent.detail].slice(-4));
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== toastEvent.detail.id));
      }, 4000);
    }

    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg",
            item.kind === "success"
              ? "border-emerald-200 text-emerald-950"
              : "border-red-200 text-red-950"
          )}
        >
          <span
            className={cn(
              "mt-1 h-2 w-2 rounded-full",
              item.kind === "success" ? "bg-emerald-500" : "bg-red-500"
            )}
          />
          <span className="min-w-0 flex-1 leading-5">{item.message}</span>
          {closeButton && (
            <button
              type="button"
              className="text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setToasts((current) => current.filter((toast) => toast.id !== item.id))}
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
