export default function Template({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex w-full flex-1 flex-col animate-fade-in">
            {children}
        </div>
    );
}
