import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ThirdwebProviderWrapper } from "@/components/providers/thirdweb-provider";
import { AnimatedBlueNebula } from "@/components/ui/AnimatedBlueNebula";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BeaverXBT — AI Wallet Manager",
  description: "Futuristic Web3 trading assistant experience powered by BeaverXBT.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${manrope.variable} font-sans antialiased h-full`}>
        <div className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <AnimatedBlueNebula />
          </div>
          <ThirdwebProviderWrapper>{children}</ThirdwebProviderWrapper>
        </div>
      </body>
    </html>
  );
}
