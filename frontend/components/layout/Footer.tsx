/// Footer

export function Footer() {
    return (
        <footer className="border-t border-white/[0.06] bg-surface-0 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-brand-700
                            flex items-center justify-center text-white font-bold text-[10px]">
                            Ex
                        </div>
                        <span className="text-sm text-white/40">
                            ExMarket — AI Prompt Marketplace on Aptos + Shelby
                        </span>
                    </div>

                    <div className="flex items-center gap-6">
                        <a href="#" className="text-xs text-white/30 hover:text-white/60 transition-colors">
                            Docs
                        </a>
                        <a href="#" className="text-xs text-white/30 hover:text-white/60 transition-colors">
                            GitHub
                        </a>
                        <a href="#" className="text-xs text-white/30 hover:text-white/60 transition-colors">
                            Twitter
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
