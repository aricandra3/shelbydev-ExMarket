/// Footer

export function Footer() {
    return (
        <footer className="mt-auto border-t-2 border-ink bg-cream/[0.04] backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 rotate-[-2deg] items-center justify-center rounded-[6px] border-2 border-ink bg-retro-coral text-[10px] font-black text-ink shadow-neo-sm">
                            Ex
                        </div>
                        <span className="text-sm font-semibold text-cream/55">
                            ExMarket — AI Prompt Marketplace on Aptos + Shelby
                        </span>
                    </div>

                    <div className="flex items-center gap-6">
                        <a href="#" className="text-xs font-black uppercase tracking-wide text-cream/45 transition-colors hover:text-retro-yellow">
                            Docs
                        </a>
                        <a href="#" className="text-xs font-black uppercase tracking-wide text-cream/45 transition-colors hover:text-retro-yellow">
                            GitHub
                        </a>
                        <a href="#" className="text-xs font-black uppercase tracking-wide text-cream/45 transition-colors hover:text-retro-yellow">
                            Twitter
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
