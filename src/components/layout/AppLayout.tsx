import { type ReactNode } from "react";

type AppLayoutProps = {
  topBar: ReactNode;
  children: ReactNode;
};

export function AppLayout({ topBar, children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-gray-900 bg-[#050505]/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-6 py-4">{topBar}</div>
      </header>
      <main className="pt-20">
        <div className="mx-auto max-w-7xl px-6 py-6">{children}</div>
      </main>
    </div>
  );
}

export default AppLayout;
