/// Root Layout — App shell with wallet provider, navbar, footer

import type { Metadata } from "next";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import "@/styles/globals.css";

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
        <html lang="en" className="dark">
            <body className="min-h-screen flex flex-col">
                <WalletProvider>
                    <Navbar />
                    <main className="flex-1">{children}</main>
                    <Footer />
                </WalletProvider>
            </body>
        </html>
    );
}
