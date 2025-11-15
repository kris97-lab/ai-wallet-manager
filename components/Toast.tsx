"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

interface ToastControls {
  success: (message: string) => void;
  error: (message: string) => void;
}

interface ToastMessage {
  id: string;
  type: "success" | "error";
  message: string;
}

const ToastContext = createContext<ToastControls | null>(null);

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const show = useCallback(
    (type: ToastMessage["type"], message: string) => {
      if (!message) {
        return;
      }
      const id = createId();
      setToasts(prev => [...prev, { id, type, message }]);
      const clearFn = typeof window === "undefined" ? setTimeout : window.setTimeout;
      clearFn(() => remove(id), 4200);
    },
    [remove]
  );

  const contextValue = useMemo<ToastControls>(
    () => ({
      success: message => show("success", message),
      error: message => show("error", message),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed top-5 right-5 z-[9999] flex w-full max-w-sm flex-col gap-3">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-white/15 bg-[#0c1f41]/90 px-4 py-3 text-sm text-white shadow-[0_15px_45px_rgba(8,12,40,0.45)] backdrop-blur"
          >
            <div className="mt-0.5">
              {toast.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-300" />
              )}
            </div>
            <div className="flex-1 text-[13px] leading-relaxed">
              {toast.message}
            </div>
            <button
              type="button"
              onClick={() => remove(toast.id)}
              className="text-white/70 transition hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
