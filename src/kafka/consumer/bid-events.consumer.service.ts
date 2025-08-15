// src/kafka/consumer/bid-events.consumer.service.ts

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Consumer, EachMessagePayload } from "kafkajs";
import { KafkaClientService } from "../kafka.client.service";
import { KAFKA_CONSUMER_GROUPS, KAFKA_TOPICS } from "../../constants";
import { RedisService } from "../../redis/redis.service";
import { AuctionRoom } from "../../auction/interface";
import { PlaceBidResult } from "../interface";
import { PlaceBidDto } from "../../auction/dtos/place-bid.dto";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class BidEventsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BidEventsConsumerService.name);
  private readonly consumer: Consumer;

  constructor(
    private kafkaClient: KafkaClientService,
    private prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    this.consumer = this.kafkaClient.getKafkaClient().consumer({
      groupId: KAFKA_CONSUMER_GROUPS.BID_PROCESSOR,
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.BID_EVENTS,
      fromBeginning: false,
    });
    this.logger.log(`Subscribed to ${KAFKA_TOPICS.BID_EVENTS}`);

    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        const payload = JSON.parse(message.value?.toString() || "{}");

        const { auctionId, amount, bidderId, bidderUsername, socketId } =
          payload;

        await this.placeBid({
          auctionId,
          amount,
          bidderId,
          bidderUsername,
          socketId,
        });
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.stop();
    await this.consumer.disconnect();
    this.logger.log("BidEvents consumer stopped and disconnected");
  }

  /**
   * Places a bid on an auction using a Prisma transaction.
   * This is the core logic for concurrency management.
   * After a successful bid, it updates the cache and publishes to Redis.
   * @param placeBidDto DTO containing bid details.
   * @returns The new highest bid if successful, otherwise throws an exception.
   */

  async placeBid(
    placeBidDto: PlaceBidDto & {
      bidderId: number;
      bidderUsername: string;
      socketId: string;
    },
  ): Promise<void> {
    const { auctionId, amount, bidderId, bidderUsername, socketId } =
      placeBidDto;

    const result = await this.prisma.$transaction(
      async (prisma): Promise<PlaceBidResult> => {
        const auction = await prisma.auction.findUnique({
          where: { id: auctionId },
        });

        if (!auction) {
          return {
            success: false,
            error: {
              message: `Auction not found | Auction ID: ${auctionId}`,
              code: "AUCTION_NOT_FOUND",
            },
          };
        }

        if (!auction.isOpen) {
          return {
            success: false,
            error: {
              message: `Auction closed | Auction ID: ${auctionId}`,
              code: "AUCTION_CLOSED",
            },
          };
        }

        if (amount <= auction.currentHighestBid.toNumber()) {
          return {
            success: false,
            error: {
              message: `Bid too low | Amount: ${amount} | Current Highest Bid: ${auction.currentHighestBid}`,
              code: "BID_TOO_LOW",
            },
          };
        }

        const newBid = await prisma.bid.create({
          data: {
            amount,
            timestamp: new Date(),
            userId: bidderId,
            auctionId,
          },
        });

        await prisma.auction.update({
          where: { id: auctionId },
          data: {
            currentHighestBid: amount,
            winnerId: bidderId,
            version: { increment: 1 },
          },
        });

        return {
          success: true,
          isOpen: auction.isOpen,
          data: newBid,
        };
      },
    );

    if (result.success) {
      const newBid = result.data!;
      this.logger.log(`New bid publishing it to redis. auctionId: ${auctionId}`);

      await this.redisService.publish(
        `auction_updates:${auctionId}`,
        "newBid",
        {
          auctionId,
          newBid: {
            amount,
            bidderId,
            bidderUsername,
            timestamp: newBid.timestamp,
          },
        },
      );

      const cacheKey = `auction:${auctionId}:state`;
      const auctionRoom: AuctionRoom = {
        exist: true,
        currentHighestBid: amount,
        winnerId: bidderId,
        winnerUsername: bidderUsername,
        isOpen: result.isOpen,
      };
      await this.redisService.setCache(cacheKey, auctionRoom);
      this.logger.log(
        `Updated cache for auction state for Auction ID: ${auctionId} after new bid.`,
      );
    } else {
      const errorCode = result.error.code;
      const errorMessage = result.error.message;

      if (socketId) {
        await this.redisService.publish("emit-to-socket", errorCode, {
          auctionId,
          errorMessage,
          socketId,
        });
      }

      this.logger.log(`Bid failed | Auction ID: ${auctionId} | Reason: ${errorCode} | Username: ${bidderUsername}`);
    }
  }
}
