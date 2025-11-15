"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { PolymarketFeed } from "../PolymarketFeed";

interface FeedSidebarProps {
  className?: string;
  isWalletConnected: boolean;
}

function SidebarContent({ isWalletConnected }: { isWalletConnected: boolean }) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Polymarket Feed — High-impact BeaverXBT flows</h2>
        <p className="text-sm text-sky-200/80">
          Monitoring large matched orders above 800&nbsp;USDC. Updates every 10 seconds.
        </p>
      </header>
      <PolymarketFeed isWalletConnected={isWalletConnected} />
    </div>
  );
}

export function FeedSidebar({ className, isWalletConnected }: FeedSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  if (!isWalletConnected) {
    return null;
  }

  return (
    <aside className={cn("w-full lg:w-[360px] lg:flex-none lg:self-stretch", className)}>
      <div className="hidden lg:block">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1b3a]/90 to-[#0f2f5d]/90 p-6 text-white shadow-[0_0_40px_rgba(48,128,255,0.12)] backdrop-blur-xl lg:sticky lg:top-10">
          <SidebarContent isWalletConnected={isWalletConnected} />
        </div>
      </div>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-[#0b1b3a]/95 to-[#0f2f5d]/95 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(48,128,255,0.18)] backdrop-blur-xl"
          aria-expanded={isOpen}
          aria-controls={panelId}
        >
          <span>Polymarket Feed</span>
          {isOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        {isOpen ? (
          <div
            id={panelId}
            className="mt-4 rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1b3a]/95 to-[#0f2f5d]/95 p-5 text-white shadow-[0_0_28px_rgba(48,128,255,0.12)] backdrop-blur-xl"
          >
            <SidebarContent isWalletConnected={isWalletConnected} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
