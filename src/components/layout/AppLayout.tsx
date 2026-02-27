import { type ReactNode } from "react";
import { Footer } from "./Footer";

type AppLayoutProps = {
  topBar: ReactNode;
  children: ReactNode;
};

export function AppLayout({ topBar, children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-surface text-white overflow-x-hidden flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-3 sm:py-4">{topBar}</div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

export default AppLayout;
