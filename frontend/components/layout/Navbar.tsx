/// Navbar

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
    { href: "/explore", label: "Marketplace" },
    { href: "/create", label: "Upload" },
    { href: "/library", label: "Library" },
    { href: "/dashboard", label: "Dashboard" },
];

export function Navbar() {
    const pathname = usePathname();
    const { connected } = useWallet();

    return (
        <nav className="absolute top-0 w-full z-50 pt-8 pb-4">
            <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
                <div className="flex items-center justify-between">

                    {/* Logo — mark + wordmark */}
                    <Link href="/" className="flex items-center gap-2.5 group">
                        {/* Brand mark: small rounded square with gradient */}
                        <span
                            className="w-6 h-6 rounded-[5px] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                            style={{ background: "linear-gradient(135deg, #7c3aed, #d946ef)" }}
                        >
                            E
                        </span>
                        <span className="text-[12px] font-semibold font-display text-white tracking-tight">
                            ExMarket
                        </span>
                    </Link>

                    {/* Nav Links + Wallet */}
                    <div className="flex items-center gap-5">
                        <div className="hidden md:flex items-center gap-5 mr-2">
                            {NAV_LINKS.map((link) => {
                                if (
                                    !connected &&
                                    (link.href === "/create" || link.href === "/dashboard" || link.href === "/library")
                                ) {
                                    return null;
                                }

                                const isActive = pathname === link.href;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={cn(
                                            "text-[12px] font-medium tracking-wide transition-colors",
                                            isActive
                                                ? "text-white"
                                                : "text-white/35 hover:text-white/80"
                                        )}
                                    >
                                        {link.label}
                                    </Link>
                                );
                            })}
                        </div>

                        <ConnectButton />
                    </div>
                </div>
            </div>
        </nav>
    );
}
