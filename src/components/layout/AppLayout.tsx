import { type ReactNode } from "react";
import { Footer } from "./Footer";

type AppLayoutProps = {
  topBar: ReactNode;
  children: ReactNode;
};

export function AppLayout({ topBar, children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden flex flex-col">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-gray-900 bg-[#050505]/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-3 sm:py-4">{topBar}</div>
      </header>
      <main className="pt-16 sm:pt-20 flex-1">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

export default AppLayout;
