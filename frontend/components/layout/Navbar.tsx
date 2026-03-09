/// Navbar

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
    { href: "/explore", label: "Explore" },
    { href: "/create", label: "Create" },
    { href: "/library", label: "My Library" },
    { href: "/dashboard", label: "Dashboard" },
];

export function Navbar() {
    const pathname = usePathname();
    const { connected } = useWallet();

    return (
        <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-surface-0/80 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-2.5 group">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700
                            flex items-center justify-center text-white font-bold text-sm
                            group-hover:shadow-lg group-hover:shadow-brand-500/20 transition-shadow">
                            Ex
                        </div>
                        <span className="font-bold text-lg text-white">
                            ExMarket
                        </span>
                    </Link>

                    {/* Nav Links */}
                    <div className="hidden md:flex items-center gap-1">
                        {NAV_LINKS.map((link) => {
                            // Hide creator-only links when not connected
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
                                        "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                        isActive
                                            ? "text-brand-400 bg-brand-500/10"
                                            : "text-white/50 hover:text-white hover:bg-white/[0.04]"
                                    )}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </div>

                    {/* Wallet */}
                    <ConnectButton />
                </div>
            </div>
        </nav>
    );
}
