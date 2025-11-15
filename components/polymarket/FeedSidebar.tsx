'use client';

import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Shield, Target, TrendingUp, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionItem {
  name: string;
  value: string;
  hint: string;
}

interface Section {
  title: string;
  description: string;
  items: SectionItem[];
  icon: LucideIcon;
}

const SECTION_CONTENT: Section[] = [
  {
    title: 'Live Market Signals',
    description:
      'Monitor actionable trading intel across Polymarket, curated for BeaverXBT portfolio moves.',
    items: [
      {
        name: 'BTC Election Futures',
        value: '+8.4% over 24h',
        hint: 'Momentum',
      },
      {
        name: 'ETH Rate Hike Hedge',
        value: '+4.1% intraday',
        hint: 'Volatility dampening',
      },
    ],
    icon: TrendingUp,
  },
  {
    title: 'DeFi Wallet Health',
    description: 'Snapshot of balances, staking yields, and hedges tied to your AI wallet.',
    items: [
      {
        name: 'Stable Yield Pods',
        value: '7.2% APY',
        hint: 'Auto-rebalanced',
      },
      {
        name: 'Perp Hedge Buffer',
        value: '$42.8k locked',
        hint: 'Capital shield',
      },
    ],
    icon: Shield,
  },
  {
    title: 'Next Best Actions',
    description:
      'Fast tasks powered by BeaverXBT automations to improve wallet performance in seconds.',
    items: [
      {
        name: 'Deploy liquidity to SOL/USDC strategy',
        value: 'Est. +3.1% weekly',
        hint: 'AI suggested',
      },
      {
        name: 'Rebalance treasury hedge',
        value: 'Risk score → 3.2',
        hint: 'Stability boost',
      },
    ],
    icon: Target,
  },
];

function SidebarPanel() {
  return (
    <div className="flex max-h-[calc(100vh-6rem)] flex-col gap-6 overflow-y-auto pr-1">
      {SECTION_CONTENT.map(section => {
        const Icon = section.icon;
        return (
          <section key={section.title} className="space-y-3">
            <header className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sky-200">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">{section.title}</h3>
                <p className="text-sm text-sky-200/80">{section.description}</p>
              </div>
            </header>
          <div className="space-y-3">
            {section.items.map(item => (
              <div
                key={item.name}
                className="group rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:border-sky-300/40 hover:bg-white/10"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white/90">{item.name}</p>
                    <p className="text-xs text-sky-200/70">{item.hint}</p>
                  </div>
                  <Zap className="h-4 w-4 text-sky-200/80" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold text-sky-100">{item.value}</p>
                <button className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-sky-200 transition hover:text-sky-100">
                  Open signal
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
        );
      })}
    </div>
  );
}

interface FeedSidebarProps {
  className?: string;
}

export function FeedSidebar({ className }: FeedSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <aside className={cn('w-full lg:w-[360px] lg:flex-none lg:self-stretch', className)}>
      <div className="hidden lg:block">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1b3a]/90 to-[#0f2f5d]/90 p-6 text-white shadow-[0_0_40px_rgba(48,128,255,0.12)] backdrop-blur-xl lg:sticky lg:top-10">
          <SidebarPanel />
        </div>
      </div>

      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-gradient-to-r from-[#0b1b3a]/95 to-[#0f2f5d]/95 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(48,128,255,0.18)] backdrop-blur-xl"
          aria-expanded={isOpen}
          aria-controls={panelId}
        >
          <span>Market intel</span>
          {isOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        {isOpen ? (
          <div
            id={panelId}
            className="mt-4 rounded-3xl border border-white/10 bg-gradient-to-br from-[#0b1b3a]/95 to-[#0f2f5d]/95 p-5 text-white shadow-[0_0_28px_rgba(48,128,255,0.12)] backdrop-blur-xl"
          >
            <SidebarPanel />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
