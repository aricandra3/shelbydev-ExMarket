import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    return [
        {
            url: "https://exmarket.vercel.app",
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 1,
        },
        {
            url: "https://exmarket.vercel.app/explore",
            lastModified: new Date(),
            changeFrequency: "daily",
            priority: 0.8,
        },
        {
            url: "https://exmarket.vercel.app/create",
            lastModified: new Date(),
            changeFrequency: "monthly",
            priority: 0.6,
        },
        {
            url: "https://exmarket.vercel.app/dashboard",
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.5,
        },
        {
            url: "https://exmarket.vercel.app/library",
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.5,
        },
    ];
}
