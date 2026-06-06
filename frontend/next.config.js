/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    outputFileTracingRoot: __dirname,
    poweredByHeader: false,
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**",
            },
        ],
    },
    experimental: {
        optimizePackageImports: ["lucide-react", "zustand"],
    },
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "X-Frame-Options", value: "DENY" },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
                    { key: "X-XSS-Protection", value: "1; mode=block" },
                    {
                        key: "Permissions-Policy",
                        value: "camera=(), microphone=(), geolocation=()",
                    },
                    {
                        key: "Content-Security-Policy",
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
                            "style-src 'self' 'unsafe-inline'",
                            "img-src 'self' data: https: blob:",
                            "font-src 'self' data: https://fonts.gstatic.com",
                            "connect-src 'self' https://fullnode.mainnet.aptoslabs.com https://api.shelby.xyz https://*.shelby.xyz wss://*.shelby.xyz https://vercel.live wss://vercel.live",
                            "frame-src 'none'",
                            "base-uri 'self'",
                            "form-action 'self'",
                        ].join("; "),
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
