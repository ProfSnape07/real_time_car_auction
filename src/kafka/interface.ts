import { Bid } from "@prisma/client";

export interface PlaceBidResult {
  success: boolean;
  data?: Bid;
  isOpen?: boolean;
  error?: {
    message: string;
    code: string;
  };
}

export interface KafkaNewBid {
  auctionId: number;
  amount: number;
  bidderId: number;
  bidderUsername: string;
  socketId: string;
}

export interface RejectedSocketConnection {
  socketId: string;
  normalizedIp: string;
  date: Date;
  error: string;
}

export interface KafkaAuditRateLimitExceeded {
  bidderId: number;
  bidderUsername: string;
  auctionId: number;
  socketId: string;
  date: Date;
  errorMessage: string;
}

export interface NoAuctionRoom {
  auctionId: number;
  userId: number;
  username: string;
  normalizedIp: string;
  date: Date;
  error: string;
}

export interface MaxUserSockets {
  userId: number;
  username: string;
  normalizedIp: string;
  date: Date;
  error: string;
}

export interface MaxUserIP {
  normalizedIp: string;
  date: Date;
  error: string;
}
