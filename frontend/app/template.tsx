"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
    const shouldReduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, filter: "blur(4px)", y: 10 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex-1 flex flex-col w-full"
        >
            {children}
        </motion.div>
    );
}
