export interface EndAuctionSummary {
  success: boolean;
  message: string;

  winningBidSummary?: {
    amount: number;
    userId?: number;
    username?: string;
  };
}

export interface AuctionRoom {
  exist: boolean;
  currentHighestBid?: number;
  winnerUsername?: string;
  winnerId?: number;
  isOpen?: boolean;
}
