import { useTermsOfService } from "../../contexts/TermsOfServiceContext";
import Logo from "../common/Logo";

export function Footer() {
  const { openToSDialog } = useTermsOfService();

  return (
    <footer className="border-t border-white/[0.06] mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo scale="sm" />
            <span className="text-xs text-zinc-500">
              &copy; 2026 BeastDex. All rights reserved.
            </span>
          </div>

          <button
            type="button"
            onClick={openToSDialog}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Terms of Service
          </button>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
