/// ClientShell — lazy-loads wallet provider + navbar on client only
/// This keeps the Aptos SDK out of the initial JS bundle.

"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";

const WalletProvider = dynamic(
    () =>
        import("@/components/wallet/WalletProvider").then(
            (mod) => mod.WalletProvider
        ),
    { ssr: false }
);

const Navbar = dynamic(
    () =>
        import("@/components/layout/Navbar").then((mod) => mod.Navbar),
    { ssr: false }
);

export function ClientShell({ children }: { children: ReactNode }) {
    return (
        <WalletProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
        </WalletProvider>
    );
}
