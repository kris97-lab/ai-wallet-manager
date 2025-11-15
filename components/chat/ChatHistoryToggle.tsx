"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";

interface ChatHistoryToggleProps {
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

export function ChatHistoryToggle({
  isOpen,
  onToggle,
  disabled = false,
  className,
}: ChatHistoryToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "group absolute left-4 top-4 z-20 hidden rounded-full border border-white/15 bg-white/10 p-2 text-sky-100 shadow-[0_0_24px_rgba(48,128,255,0.18)] backdrop-blur-xl transition hover:border-white/30 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 md:inline-flex",
        className,
      )}
      aria-pressed={isOpen}
      aria-label={isOpen ? "Collapse chat history" : "Expand chat history"}
    >
      {isOpen ? (
        <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
      ) : (
        <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
