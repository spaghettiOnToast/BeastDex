import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAccount } from "@starknet-react/core";
import {
  getTrade,
  sendOffer,
  getMyTrades,
  cancelTrade,
  lockTrade,
  acceptTrade,
  rejectTrade,
  deleteTrade
} from "../services/trades";
import { fetchBeastsByIds } from "../services/beast";
import type { Trade } from "../lib/db";
import type { Beast } from "../services/beast";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Separator } from "../components/ui/separator";
import {
  Copy,
  CheckCircle,
  Clock,
  ArrowRightLeft,
  Plus,
  X,
  Lock,
  Send,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Trash2
} from "lucide-react";
import TopBar from "../components/header/TopBar";
import { AppLayout } from "../components/layout/AppLayout";
import { TradeBeastCard } from "../components/trade/TradeBeastCard";

export default function TradePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { account } = useAccount();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [beastsA, setBeastsA] = useState<Beast[]>([]);
  const [beastsB, setBeastsB] = useState<Beast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const connectedWalletAddress = account?.address;

  useEffect(() => {
    const fetchData = async (isInitialLoad = false) => {
      try {
        if (isInitialLoad) {
          setLoading(true);
        }
        setError(null);

        if (id) {
          // Fetch specific trade
          const { trade } = await getTrade(id);
          trade.offer_a = Array.isArray(trade.offer_a) ? trade.offer_a : [];
          trade.offer_b = Array.isArray(trade.offer_b) ? trade.offer_b : [];
          setTrade(trade);

          // Fetch beast data
          const [fetchedBeastsA, fetchedBeastsB] = await Promise.all([
            fetchBeastsByIds(trade.offer_a),
            fetchBeastsByIds(trade.offer_b),
          ]);
          setBeastsA(fetchedBeastsA);
          setBeastsB(fetchedBeastsB);
        } else if (connectedWalletAddress) {
          // Fetch all user's trades
          console.log('Fetching trades for address:', connectedWalletAddress);
          const { trades } = await getMyTrades(connectedWalletAddress);
          console.log('Received trades:', trades);
          const sanitizedTrades = trades.map(t => ({
            ...t,
            offer_a: Array.isArray(t.offer_a) ? t.offer_a : [],
            offer_b: Array.isArray(t.offer_b) ? t.offer_b : [],
          }));
          setTrades(sanitizedTrades);
        } else {
          setError('Please connect your wallet to view your trades');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : id ? 'Failed to load trade' : 'Failed to load trades');
      } finally {
        if (isInitialLoad) {
          setLoading(false);
        }
      }
    };

    fetchData(true);

    // Poll for updates every 5 seconds only if viewing a specific trade
    if (id) {
      const interval = setInterval(() => fetchData(false), 5000);
      return () => clearInterval(interval);
    }
  }, [id, connectedWalletAddress]);

  const handleSendOffer = async () => {
    if (!trade || !connectedWalletAddress) return;

    try {
      setSending(true);

      // Create a dummy transaction hash for testing
      const txHash = `0x${Math.random().toString(16).substring(2, 66)}`;
      console.log('Trade confirmation transaction hash:', txHash);

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

  const handleCancelTrade = async (tradeId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (!confirm('Are you sure you want to cancel this trade?')) {
      return;
    }

    try {
      setCancelling(tradeId);
      await cancelTrade(tradeId);

      if (connectedWalletAddress) {
        const { trades: updatedTrades } = await getMyTrades(connectedWalletAddress);
        setTrades(updatedTrades);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel trade');
    } finally {
      setCancelling(null);
    }
  };

  const handleDeleteTrade = async (tradeId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    if (!confirm('Are you sure you want to permanently delete this trade from your list? This cannot be undone.')) {
      return;
    }

    try {
      setDeleting(tradeId);
      await deleteTrade(tradeId);

      if (connectedWalletAddress) {
        const { trades: updatedTrades } = await getMyTrades(connectedWalletAddress);
        setTrades(updatedTrades);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete trade');
    } finally {
      setDeleting(null);
    }
  };

  const handleLockTrade = async () => {
    if (!trade) return;

    if (!confirm('Lock this trade and send to the other party? You won\'t be able to modify it after locking.')) {
      return;
    }

    try {
      setLocking(true);
      const { trade: updatedTrade } = await lockTrade(trade.id);
      setTrade(updatedTrade);
      alert('Trade locked and ready to share!');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to lock trade');
    } finally {
      setLocking(false);
    }
  };

  const handleAcceptTrade = async () => {
    if (!trade) return;

    if (!confirm('Accept this trade offer? You will need to send your beasts after accepting.')) {
      return;
    }

    try {
      setAccepting(true);
      const { trade: updatedTrade } = await acceptTrade(trade.id);
      setTrade(updatedTrade);
      alert('Trade accepted! Both parties can now send their beasts.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to accept trade');
    } finally {
      setAccepting(false);
    }
  };

  const handleRejectTrade = async () => {
    if (!trade) return;

    if (!confirm('Reject this trade offer? This cannot be undone.')) {
      return;
    }

    try {
      setRejecting(true);
      const { trade: updatedTrade } = await rejectTrade(trade.id);
      setTrade(updatedTrade);
      alert('Trade rejected.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reject trade');
    } finally {
      setRejecting(false);
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

  const getStatusColor = (status: Trade['status']) => {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'PENDING': return 'default';
      case 'ACCEPTED': return 'default';
      case 'COMPLETE': return 'default';
      case 'REJECTED': return 'destructive';
      case 'CANCELLED': return 'destructive';
      default: return 'secondary';
    }
  };

  const getStatusIcon = (status: Trade['status']) => {
    switch (status) {
      case 'DRAFT': return <Clock className="w-3 h-3 mr-1" />;
      case 'PENDING': return <AlertCircle className="w-3 h-3 mr-1" />;
      case 'ACCEPTED': return <ThumbsUp className="w-3 h-3 mr-1" />;
      case 'COMPLETE': return <CheckCircle className="w-3 h-3 mr-1" />;
      case 'REJECTED': return <ThumbsDown className="w-3 h-3 mr-1" />;
      case 'CANCELLED': return <X className="w-3 h-3 mr-1" />;
      default: return null;
    }
  };

  const isUserA = connectedWalletAddress && trade?.account_a === connectedWalletAddress;
  const isUserB = connectedWalletAddress && trade?.account_b === connectedWalletAddress;
  const isUserInTrade = isUserA || isUserB;

  const canLock = isUserA && trade?.status === 'DRAFT';
  const canAccept = isUserB && trade?.status === 'PENDING' && trade?.account_b_accepted === null;
  const canSend = isUserInTrade && trade?.status === 'ACCEPTED';
  const hasUserSent = connectedWalletAddress && trade && (
    (trade.account_a === connectedWalletAddress && trade.offer_a_sent) ||
    (trade.account_b === connectedWalletAddress && trade.offer_b_sent)
  );

  // Handle trades list view
  if (!id) {
    return (
      <AppLayout topBar={<TopBar />}>
        <div className="max-w-6xl mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">My Trades</h1>
              <p className="text-muted-foreground">Manage your beast trading activities</p>
            </div>
            <Button
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create New Trade
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading trades...</p>
              </div>
            </div>
          )}

          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-2 text-destructive">Trading Service Unavailable</h3>
                  <p className="text-muted-foreground mb-4">{error}</p>
                  {!connectedWalletAddress ? (
                    <Button onClick={() => navigate('/')}>
                      Connect Wallet
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button variant="outline" onClick={() => window.location.reload()}>
                          Retry
                        </Button>
                        <Button onClick={() => navigate('/')}>
                          Back to Home
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {!loading && !error && trades.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <ArrowRightLeft className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No trades yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Start trading beasts by creating your first trade offer
                  </p>
                  <Button onClick={() => navigate('/')}>
                    Create Your First Trade
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!loading && !error && trades.length > 0 && (
            <div className="grid gap-4">
              {trades.map((trade) => {
                const isCreator = trade.account_a === connectedWalletAddress;
                const canCancel = trade.status === 'DRAFT';
                const canDelete = trade.status === 'CANCELLED' || trade.status === 'REJECTED' || trade.status === 'COMPLETE';

                return (
                  <Card key={trade.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/trade/${trade.id}`)}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={getStatusColor(trade.status)}>
                              {getStatusIcon(trade.status)}
                              {trade.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Created {new Date(trade.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">{isCreator ? 'Your' : 'Their'} Offer:</p>
                              <p>{trade.offer_a.length} beast{trade.offer_a.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">{isCreator ? 'Their' : 'Your'} Offer:</p>
                              <p>{trade.offer_b.length} beast{trade.offer_b.length !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex gap-2">
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                          {canCancel && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => handleCancelTrade(trade.id, e)}
                              disabled={cancelling === trade.id}
                            >
                              <X className="w-4 h-4 mr-1" />
                              {cancelling === trade.id ? 'Cancelling...' : 'Cancel'}
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => handleDeleteTrade(trade.id, e)}
                              disabled={deleting === trade.id}
                              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // Handle single trade view
  if (loading) {
    return (
      <AppLayout topBar={<TopBar />}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading trade...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !trade) {
    return (
      <AppLayout topBar={<TopBar />}>
        <div className="flex items-center justify-center py-12">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-center text-destructive">Trade Not Found</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground mb-4">
                {error || 'The trade you are looking for does not exist.'}
              </p>
              <Button onClick={() => navigate('/trades')}>
                Back to Trades
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout topBar={<TopBar />}>
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold tracking-tight">Trade Details</h1>
            <div className="flex items-center gap-2">
              <Badge variant={getStatusColor(trade.status)}>
                {getStatusIcon(trade.status)}
                {trade.status}
              </Badge>
              {trade.trade_locked && (
                <Badge variant="outline">
                  <Lock className="w-3 h-3 mr-1" />
                  Locked
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={copyTradeLink}>
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </Button>
            </div>
          </div>

          {/* Status Messages */}
          {trade.status === 'DRAFT' && isUserA && (
            <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <CardContent className="pt-4">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  This is a draft trade. Review the details and lock it when ready to share with {formatAddress(trade.account_b || '')}.
                </p>
              </CardContent>
            </Card>
          )}

          {trade.status === 'PENDING' && isUserB && (
            <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
              <CardContent className="pt-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {formatAddress(trade.account_a)} wants to trade with you. Review the offer and accept or reject.
                </p>
              </CardContent>
            </Card>
          )}

          {trade.status === 'ACCEPTED' && isUserInTrade && (
            <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <CardContent className="pt-4">
                <p className="text-sm text-green-800 dark:text-green-200">
                  Trade accepted! Both parties can now send their beasts to complete the trade.
                </p>
              </CardContent>
            </Card>
          )}

          {trade.status === 'REJECTED' && (
            <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
              <CardContent className="pt-4">
                <p className="text-sm text-red-800 dark:text-red-200">
                  This trade was rejected by {formatAddress(trade.account_b || '')}.
                </p>
              </CardContent>
            </Card>
          )}

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
                <div>
                  <span>{isUserA ? 'Your Offer' : `${formatAddress(trade.account_a)}'s Offer`}</span>
                </div>
                {trade.offer_a_sent && <Badge variant="default"><Send className="w-3 h-3 mr-1" />Sent</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {beastsA.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {beastsA.map((beast) => (
                      <TradeBeastCard key={beast.id} beast={beast} compact />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No beasts offered</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Account B Side */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div>
                  <span>{isUserB ? 'Your Offer' : trade.account_b ? `${formatAddress(trade.account_b)}'s Offer` : 'Waiting for partner...'}</span>
                </div>
                {trade.offer_b_sent && <Badge variant="default"><Send className="w-3 h-3 mr-1" />Sent</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {beastsB.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {beastsB.map((beast) => (
                      <TradeBeastCard key={beast.id} beast={beast} compact />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No beasts offered</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-6" />

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {canLock && (
            <Button
              onClick={handleLockTrade}
              disabled={locking}
              className="flex items-center gap-2"
            >
              <Lock className="w-4 h-4" />
              {locking ? 'Locking...' : 'Lock & Share Trade'}
            </Button>
          )}

          {canAccept && (
            <>
              <Button
                onClick={handleAcceptTrade}
                disabled={accepting}
                className="flex items-center gap-2"
              >
                <ThumbsUp className="w-4 h-4" />
                {accepting ? 'Accepting...' : 'Accept Trade'}
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectTrade}
                disabled={rejecting}
                className="flex items-center gap-2"
              >
                <ThumbsDown className="w-4 h-4" />
                {rejecting ? 'Rejecting...' : 'Reject Trade'}
              </Button>
            </>
          )}

          {canSend && !hasUserSent && (
            <Button
              onClick={handleSendOffer}
              disabled={sending}
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending...' : 'Send My Beasts'}
            </Button>
          )}

          {hasUserSent && (
            <Badge variant="default" className="px-4 py-2">
              <CheckCircle className="w-4 h-4 mr-2" />
              You have sent your beasts
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
              <span className="font-mono text-xs">{trade.id}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
