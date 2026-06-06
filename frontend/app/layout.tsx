/// Root Layout — App shell with wallet provider, navbar, footer

import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";
import { ClientShell } from "@/components/ClientShell";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });


export const metadata: Metadata = {
    metadataBase: new URL("https://exmarket.vercel.app"),
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
        "prompt marketplace",
        "AI agents",
    ],
    openGraph: {
        title: "ExMarket — AI Prompt Marketplace",
        description:
            "Decentralized pay-per-use AI prompt marketplace. Buy, sell, and access premium AI prompts on Aptos + Shelby.",
        url: "https://exmarket.vercel.app",
        siteName: "ExMarket",
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "ExMarket — AI Prompt Marketplace",
            },
        ],
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "ExMarket — AI Prompt Marketplace",
        description:
            "Decentralized pay-per-use AI prompt marketplace on Aptos + Shelby.",
    },
    robots: {
        index: true,
        follow: true,
    },
    icons: {
        icon: "/favicon.svg",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`dark ${inter.variable} ${outfit.variable} ${jetbrains.variable}`}>
            <head>
                {/* Preload critical resources */}
                <link rel="preload" href="/assets/noise.png" as="image" type="image/png" />
                <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
            </head>
            <body className="relative flex min-h-screen flex-col overflow-x-hidden bg-retro-paper font-sans text-cream antialiased">
                <div aria-hidden className="fixed inset-0 w-full h-full bg-noise mix-blend-overlay" />
                <div
                    aria-hidden
                    className="fixed inset-x-0 top-0 h-28 border-b-2 border-ink bg-cream/[0.04] backdrop-blur-xl pointer-events-none"
                />

                <div className="relative z-10 flex flex-col min-h-screen">
                    <ClientShell>{children}</ClientShell>
                </div>
            </body>
        </html>
    );
}
