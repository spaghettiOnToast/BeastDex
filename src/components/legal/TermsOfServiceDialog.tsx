import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import { useTermsOfService } from "../../contexts/TermsOfServiceContext";
import { AlertTriangle } from "lucide-react";

export function TermsOfServiceDialog() {
  const { showToSDialog, acceptToS, declineToS, hasAcceptedToS } = useTermsOfService();
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset scroll state when dialog opens
  useEffect(() => {
    if (showToSDialog) {
      setHasScrolledToBottom(false);
    }
  }, [showToSDialog]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 50;
    if (isAtBottom) {
      setHasScrolledToBottom(true);
    }
  };

  // Don't render if already accepted and dialog shouldn't show
  if (hasAcceptedToS && !showToSDialog) return null;

  return (
    <Dialog open={showToSDialog} onOpenChange={() => {/* Prevent closing by clicking outside - must explicitly accept or decline */}}>
      <DialogContent className="max-w-2xl bg-gradient-to-br from-gray-900 to-black border-gray-700 [&>button.absolute]:hidden">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-2">
            <span className="text-lsGold">BeastDex</span> Marketplace Terms of Service
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Please read and accept our terms to use the marketplace
          </DialogDescription>
        </DialogHeader>

        <div
          className="h-[45vh] overflow-y-auto pr-4 border border-gray-700/50 rounded-lg bg-black/30"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          <div className="p-4 space-y-4 text-sm text-gray-300">
            <p className="text-xs text-gray-500 italic">
              Last Updated: February 2026 | Version 1.0.0
            </p>

            <section>
              <h3 className="text-white font-semibold mb-2">1. Acceptance of Terms</h3>
              <p>
                By accessing and using BeastDex, you agree to be bound by these Terms of Service.
                If you do not agree, please disconnect your wallet.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">2. Eligibility</h3>
              <p>
                You must be at least 18 years old and have the legal capacity to enter into these terms.
                You are responsible for ensuring compliance with all applicable laws in your jurisdiction.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">3. Risks</h3>
              <p>
                Trading NFTs involves significant risk. Prices can be volatile and you may lose some or
                all of your investment. BeastDex operates through smart contracts on Starknet. While we
                strive for security, smart contracts may contain bugs or vulnerabilities. You acknowledge
                these risks and accept full responsibility for your trading decisions.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">4. No Financial Advice</h3>
              <p>
                Nothing on this platform constitutes financial, investment, or trading advice. NFTs are
                digital collectibles, NOT investments or securities. Always do your own research before
                making any decisions.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">5. Fees</h3>
              <p>
                Trading on BeastDex may incur fees including platform fees (5%), creator royalties (5%),
                and network gas fees. All applicable fees will be displayed before you confirm a transaction.
                All transactions are executed atomically via smart contracts - BeastDex does not hold user
                funds or NFTs in escrow.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">6. Prohibited Conduct</h3>
              <p>
                You agree not to engage in market manipulation, wash trading, IP infringement, money laundering,
                or any other illegal activities on the platform.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">7. Limitation of Liability</h3>
              <p>
                To the maximum extent permitted by law, BeastDex shall not be liable for any indirect,
                incidental, special, or consequential damages arising from your use of the Marketplace,
                including loss of profits, data, or the value of any NFT.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">8. Indemnification</h3>
              <p>
                You agree to indemnify and hold harmless BeastDex from any claims, damages, or expenses
                arising from your use of the Marketplace or violation of these Terms.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">9. Privacy</h3>
              <p>
                Your wallet address and transaction history are publicly visible on the blockchain.
                We do not collect additional personal information beyond what is necessary to provide our services.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">10. Dispute Resolution</h3>
              <p>
                Any disputes shall be resolved through binding arbitration. You waive any right to a jury
                trial or to participate in a class action.
              </p>
            </section>

            <section>
              <h3 className="text-white font-semibold mb-2">11. Modifications</h3>
              <p>
                We reserve the right to modify these terms at any time. Continued use of the platform
                after changes constitutes acceptance of the new terms.
              </p>
            </section>
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-gray-700">
          <p className="text-center text-gray-400 text-xs">
            By clicking "I Accept", you acknowledge that you have read and agree to the Terms of Service.
          </p>

          {!hasScrolledToBottom && (
            <div className="flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/30 rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Please scroll to the bottom to read the full terms before accepting</span>
            </div>
          )}

          <div className="flex flex-row justify-center gap-3">
            <button
              type="button"
              onClick={declineToS}
              className="px-6 py-2 rounded-md border border-gray-600 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={acceptToS}
              disabled={!hasScrolledToBottom}
              style={{
                backgroundColor: hasScrolledToBottom ? '#d0c98d' : '#374151',
                color: hasScrolledToBottom ? '#000000' : '#9ca3af',
                cursor: hasScrolledToBottom ? 'pointer' : 'not-allowed',
              }}
              className="px-6 py-2 rounded-md font-semibold transition-colors"
            >
              I Accept
            </button>
          </div>

          <p className="text-center text-gray-500 text-xs">
            By declining, your wallet will be disconnected.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
