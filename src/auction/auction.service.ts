// src/auction/auction.service.ts

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Auction, Prisma } from "@prisma/client";
import { RedisService } from "../redis/redis.service";
import { AuctionRoom, EndAuctionSummary } from "./interface";

@Injectable()
export class AuctionService {
  private readonly logger = new Logger(AuctionService.name);

  constructor(
    private prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Retrieves all available auctions.
   */
  async findAll(): Promise<Auction[]> {
    return this.prisma.auction.findMany();
  }

  /**
   * Retrieves the current state of a specific auction from the database.
   * Uses Redis cache to minimize database load.
   * @param auctionId The ID of the auction.
   * @returns The auction state or null if not found.
   */
  async getAuctionState(auctionId: number): Promise<AuctionRoom> {
    const cacheKey = `auction:${auctionId}:state`;

    const cachedAuctionState =
      await this.redisService.getCache<AuctionRoom>(cacheKey);
    if (cachedAuctionState) {
      this.logger.log(`Cache hit for auction state | Auction ID: ${auctionId}`);
      return cachedAuctionState;
    }

    this.logger.log(`Cache miss for auction state | Auction ID: ${auctionId}`);
    const auction = await this.prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (auction) {
      const winnerId = auction.winnerId;
      let winnerUsername: string;
      if (winnerId) {
        const winner = await this.prisma.user.findUnique({
          where: { id: winnerId },
        });
        winnerUsername = winner.username;
      }
      const auctionRoom: AuctionRoom = {
        exist: true,
        currentHighestBid: auction.currentHighestBid.toNumber(),
        winnerId: auction.winnerId,
        winnerUsername: winnerUsername,
        isOpen: auction.isOpen,
      };
      await this.redisService.setCache(cacheKey, auctionRoom);
      this.logger.log(`Cached auction state for Auction ID: ${auctionId}`);
      return auctionRoom;
    } else {
      const auctionRoom: AuctionRoom = {
        exist: false,
      };
      this.logger.warn(`Auction not found | Auction ID: ${auctionId}`);
      return auctionRoom;
    }
  }

  /**
   * Closes an auction and returns the final bid summary.
   * Updates cache and publishes auction end event to Redis.
   * @param auctionId The ID of the auction to close.
   * @returns The final winning bid summary.
   */
  async endAuction(auctionId: number): Promise<EndAuctionSummary> {
      const currentState = await this.prisma.auction.findUnique({
        where: { id: auctionId },
      });
      if (!currentState) {
        const message = `Auction not found | Auction ID: ${auctionId}`;
        this.logger.log(message);
        return {
          success: false,
          message: message,
        };
      }
      const isClosed = !currentState.isOpen;
      if (isClosed) {
        const message = `Auction already closed | Auction ID: ${auctionId} | End Time: ${currentState.endTime}`;
        this.logger.log(message);
        return {
          success: false,
          message: message,
        };
      }

      type AuctionWithBids = Prisma.AuctionGetPayload<{
        include: {
          bids: {
            orderBy: { amount: "desc" };
            take: 1;
            include: { user: true };
          };
        };
      }>;

      const updatedAuction: AuctionWithBids = await this.prisma.auction.update({
        where: { id: auctionId },
        data: {
          isOpen: false,
          endTime: new Date(),
        },
        include: {
          bids: {
            orderBy: { amount: "desc" },
            take: 1,
            include: { user: true },
          },
        },
      });

      let summary: EndAuctionSummary;
      if (updatedAuction.bids.length === 0) {
        const message = `Auction closed | Auction ID: ${auctionId} | No bids found.`;
        this.logger.log(message);
        summary = {
          success: true,
          message: message,
          winningBidSummary: { amount: 0, userId: null, username: null },
        };
      } else {
        const winningBid = updatedAuction.bids[0]!;
        const message = `Auction closed | Auction ID: ${auctionId} | Winner: ${winningBid.user.username} | Amount: ${winningBid.amount}`;
        this.logger.log(message);

        summary = {
          success: true,
          message: message,
          winningBidSummary: {
            amount: winningBid.amount.toNumber(),
            userId: winningBid.userId,
            username: winningBid.user.username,
          },
        };
      }

      await this.redisService.publish(
        `auction_updates:${auctionId}`,
        "auctionEnd",
        {
          auctionId,
          winningBid: summary.winningBidSummary,
          message: summary.message,
        },
      );

      const cacheKey = `auction:${auctionId}:state`;
      const auctionRoom: AuctionRoom = {
        exist: true,
        currentHighestBid: summary.winningBidSummary.amount,
        winnerId: summary.winningBidSummary.userId,
        winnerUsername: summary.winningBidSummary.username,
        isOpen: false,
      };
      await this.redisService.setCache(cacheKey, auctionRoom);
      this.logger.log(
        `Updated auction state for Auction ID: ${auctionId} after bid end.`,
      );

      return summary;
  }
}
