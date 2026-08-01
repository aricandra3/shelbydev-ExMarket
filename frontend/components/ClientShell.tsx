/// ClientShell — hosts the application-wide wallet state and navigation.

"use client";

import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { WalletProvider } from "@/components/wallet/WalletProvider";

export function ClientShell({ children }: { children: ReactNode }) {
    return (
        <WalletProvider>
            <Navbar />
            <div className="flex-1">{children}</div>
            <Footer />
        </WalletProvider>
    );
}
