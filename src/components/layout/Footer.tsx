import { useTermsOfService } from "../../contexts/TermsOfServiceContext";
import Logo from "../common/Logo";

export function Footer() {
  const { openToSDialog } = useTermsOfService();

  return (
    <footer className="border-t border-gray-800/50 bg-black/30 backdrop-blur-sm mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Logo and Copyright */}
          <div className="flex items-center gap-3">
            <Logo scale="sm" />
            <span className="text-xs text-gray-500">
              &copy; 2026 BeastDex. All rights reserved.
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={openToSDialog}
              className="text-xs text-gray-400 hover:text-lsGold transition-colors"
            >
              Terms of Service
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
