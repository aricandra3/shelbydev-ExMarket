/// Navbar

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Library, Search, Upload } from "lucide-react";

const NAV_LINKS = [
    { href: "/explore", label: "Market", icon: Search },
    { href: "/create", label: "Upload", icon: Upload },
    { href: "/library", label: "Library", icon: Library },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function Navbar() {
    const pathname = usePathname();
    const { connected } = useWallet();

    return (
        <nav className="sticky top-0 z-50 px-4 py-4">
            <div className="mx-auto max-w-[1400px]">
                <div className="glass-card flex overflow-visible items-center justify-between px-4 py-3 md:px-5">

                    <Link href="/" className="group flex items-center gap-2.5">
                        <span className="flex h-8 w-8 flex-shrink-0 rotate-[-3deg] items-center justify-center rounded-[6px] border-2 border-ink bg-retro-yellow text-sm font-black text-ink shadow-neo-sm transition-transform group-hover:rotate-3">
                            E
                        </span>
                        <span className="font-display text-sm font-black uppercase tracking-wide text-cream">
                            ExMarket
                        </span>
                    </Link>

                    <div className="flex items-center gap-3">
                        <div className="hidden items-center gap-1 md:flex">
                            {NAV_LINKS.map((link) => {
                                if (
                                    !connected &&
                                    (link.href === "/create" || link.href === "/dashboard" || link.href === "/library")
                                ) {
                                    return null;
                                }

                                const isActive = pathname === link.href;
                                const Icon = link.icon;
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={cn(
                                            "inline-flex min-h-11 items-center gap-1.5 rounded-[6px] border-2 px-3 py-2 text-[11px] font-black uppercase tracking-wide transition-all",
                                            isActive
                                                ? "border-ink bg-retro-cyan text-ink shadow-neo-sm"
                                                : "border-transparent text-cream/55 hover:border-cream/60 hover:bg-cream/10 hover:text-cream"
                                        )}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
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
