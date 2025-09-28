import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import { controllerConnector } from "../wallet/controller";
import { getTrade, joinTrade, sendOffer } from "../services/trades";
import type { Trade } from "../lib/db";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import { Copy, CheckCircle, Clock, Users, ArrowRightLeft } from "lucide-react";

export default function TradePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { account } = useAccount();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [sending, setSending] = useState(false);

  const connectedWalletAddress = account?.address;

  useEffect(() => {
    if (!id) return;

    const fetchTrade = async () => {
      try {
        setLoading(true);
        const { trade } = await getTrade(id);
        setTrade(trade);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load trade');
      } finally {
        setLoading(false);
      }
    };

    fetchTrade();

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchTrade, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const handleJoinTrade = async () => {
    if (!trade || !connectedWalletAddress) return;

    try {
      setJoining(true);
      const { trade: updatedTrade } = await joinTrade(trade.id, connectedWalletAddress);
      setTrade(updatedTrade);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to join trade');
    } finally {
      setJoining(false);
    }
  };

  const handleSendOffer = async () => {
    if (!trade || !connectedWalletAddress) return;

    try {
      setSending(true);

      // Create a dummy transaction using Cartridge Controller
      // This simulates confirming the trade without actually transferring assets
      let txHash: string;

      try {
        const dummyCall = {
          contractAddress: "0x1", // Dummy contract address
          entrypoint: "confirm_trade",
          calldata: [trade.id, connectedWalletAddress]
        };

        // Execute dummy transaction through Cartridge Controller
        const result = await controllerConnector.execute([dummyCall]);
        txHash = result.transaction_hash;

        console.log('Trade confirmation transaction:', txHash);
      } catch (transactionError) {
        console.log('Transaction simulation failed, using fallback hash:', transactionError);
        // Fallback to dummy hash if transaction fails (for testing purposes)
        txHash = `0x${Math.random().toString(16).substr(2, 64)}`;
      }

      const { trade: updatedTrade } = await sendOffer(trade.id, connectedWalletAddress, txHash);
      setTrade(updatedTrade);

      if (updatedTrade.status === 'COMPLETE') {
        alert('Trade completed successfully!');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send offer');
    } finally {
      setSending(false);
    }
  };

  const copyTradeLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert('Trade link copied to clipboard!');
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const isUserInTrade = connectedWalletAddress && (
    trade?.account_a === connectedWalletAddress ||
    trade?.account_b === connectedWalletAddress
  );

  const canJoin = connectedWalletAddress && trade && !trade.account_b && trade.account_a !== connectedWalletAddress;
  const canSend = isUserInTrade && trade?.status === 'OPEN';
  const hasUserSent = connectedWalletAddress && trade && (
    (trade.account_a === connectedWalletAddress && trade.offer_a_sent) ||
    (trade.account_b === connectedWalletAddress && trade.offer_b_sent)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading trade...</p>
        </div>
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-destructive">Trade Not Found</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              {error || 'The trade you are looking for does not exist.'}
            </p>
            <Button onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold tracking-tight">Trade Details</h1>
            <div className="flex items-center gap-2">
              <Badge variant={trade.status === 'COMPLETE' ? 'default' : 'secondary'}>
                {trade.status === 'COMPLETE' && <CheckCircle className="w-3 h-3 mr-1" />}
                {trade.status === 'OPEN' && <Clock className="w-3 h-3 mr-1" />}
                {trade.status}
              </Badge>
              <Button variant="outline" size="sm" onClick={copyTradeLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
            </div>
          </div>

          {!connectedWalletAddress && (
            <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
              <CardContent className="pt-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Connect your wallet to participate in this trade.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Trade Content */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Account A Side */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Account A</span>
                {trade.offer_a_sent && <Badge variant="default">Sent</Badge>}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {formatAddress(trade.account_a)}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium mb-2">Offering:</h4>
                  {trade.offer_a.length > 0 ? (
                    <div className="space-y-1">
                      {trade.offer_a.map((beastId, index) => (
                        <div key={index} className="p-2 bg-muted rounded text-sm">
                          Beast #{beastId}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No beasts offered</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account B Side */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Account B</span>
                {trade.offer_b_sent && <Badge variant="default">Sent</Badge>}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {trade.account_b ? formatAddress(trade.account_b) : 'Waiting for player...'}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium mb-2">Offering:</h4>
                  {trade.offer_b.length > 0 ? (
                    <div className="space-y-1">
                      {trade.offer_b.map((beastId, index) => (
                        <div key={index} className="p-2 bg-muted rounded text-sm">
                          Beast #{beastId}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No beasts offered</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-6" />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {canJoin && (
            <Button
              onClick={handleJoinTrade}
              disabled={joining}
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              {joining ? 'Joining...' : 'Join Trade'}
            </Button>
          )}

          {canSend && !hasUserSent && (
            <Button
              onClick={handleSendOffer}
              disabled={sending}
              className="flex items-center gap-2"
            >
              <ArrowRightLeft className="w-4 h-4" />
              {sending ? 'Sending...' : 'Send My Offer'}
            </Button>
          )}

          {hasUserSent && (
            <Badge variant="default" className="px-4 py-2">
              <CheckCircle className="w-4 h-4 mr-2" />
              You have sent your offer
            </Badge>
          )}
        </div>

        {/* Trade Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Trade Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created:</span>
              <span>{new Date(trade.created_at).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires:</span>
              <span>{new Date(trade.expires_at).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trade ID:</span>
              <span className="font-mono">{trade.id}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}