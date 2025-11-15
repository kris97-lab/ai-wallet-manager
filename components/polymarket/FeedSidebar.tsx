"use client";

import { cn } from "@/lib/utils";
import { PolymarketFeed } from "../PolymarketFeed";

interface FeedSidebarProps {
  className?: string;
  isWalletConnected: boolean;
}

export function FeedSidebar({ className, isWalletConnected }: FeedSidebarProps) {
  if (!isWalletConnected) {
    return null;
  }

  return (
    <aside
      className={cn(
        "hidden h-full min-h-0 lg:flex lg:w-[380px] lg:flex-col",
        className
      )}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[16px] border border-white/10 bg-gradient-to-br from-[#0b1b3a]/90 to-[#0f2f5d]/90 text-white shadow-[0_0_40px_rgba(48,128,255,0.16)] backdrop-blur-2xl">
        <header className="flex h-[50px] items-center border-b border-white/10 px-5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.4em] text-white/90">
            Polymarket Feed — High-impact BeaverXBT flows
          </h2>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-xs text-sky-200/70">
            Monitoring large matched orders above 800&nbsp;USDC. Updates every 10 seconds.
          </p>
          <PolymarketFeed isWalletConnected={isWalletConnected} />
        </div>
      </div>
    </aside>
  );
}
