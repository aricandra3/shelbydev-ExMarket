/// Root Layout — App shell with wallet provider, navbar, footer

import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });


export const metadata: Metadata = {
    title: "ExMarket — AI Prompt Marketplace",
    description:
        "Decentralized pay-per-use AI prompt marketplace. Buy, sell, and access premium AI prompts, agent workflows, and automation templates on Aptos + Shelby.",
    keywords: [
        "AI prompts",
        "marketplace",
        "Aptos",
        "Shelby",
        "decentralized",
        "Web3",
        "blockchain",
    ],
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`dark ${inter.variable} ${outfit.variable}`}>
            <body className="relative flex min-h-screen flex-col overflow-x-hidden bg-retro-paper font-sans text-cream antialiased">
                <div className="fixed inset-0 w-full h-full bg-noise mix-blend-overlay" />
                <div className="fixed inset-0 retro-grid opacity-70 pointer-events-none" />
                <div
                    aria-hidden
                    className="fixed inset-x-0 top-0 h-28 border-b-2 border-ink bg-cream/[0.04] backdrop-blur-xl pointer-events-none"
                />

                <div className="relative z-10 flex flex-col min-h-screen">
                    <WalletProvider>
                        <Navbar />
                        <main className="flex-1">{children}</main>
                        <Footer />
                    </WalletProvider>
                </div>
            </body>
        </html>
    );
}
