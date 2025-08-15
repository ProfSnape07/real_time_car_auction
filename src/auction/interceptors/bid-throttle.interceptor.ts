// src/auction/interceptors/bid-throttle.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { RedisService } from "../../redis/redis.service";
import { MAX_BIDS, WINDOW_SECONDS } from "../../constants";
import { KafkaProducerService } from "../../kafka/kafka.producer.service";

class TooManyRequestsException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: "Rate limit exceeded",
        message: "Too many bids, please slow down.",
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

@Injectable()
export class BidThrottleInterceptor implements NestInterceptor {
  private readonly logger = new Logger(BidThrottleInterceptor.name);
  private readonly MAX_BIDS = MAX_BIDS;
  private readonly WINDOW_SECONDS = WINDOW_SECONDS;
  private tooManyRequestsException: TooManyRequestsException;

  constructor(
    private readonly redisService: RedisService,
    private readonly kafkaService: KafkaProducerService,
  ) {
    this.tooManyRequestsException = new TooManyRequestsException();
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const client = context.switchToWs().getClient();
    const user = client.user;

    const key = `user:${user.username}:bid_timestamps`;
    const now = Date.now();

    // Remove timestamps older than window
    await this.redisService.zremrangebyscore(
      key,
      0,
      now - this.WINDOW_SECONDS * 1000,
    );

    const count = await this.redisService.zcard(key);

    if (count >= this.MAX_BIDS) {
      this.logger.error(`Bid rate limit exceeded for user ${user.username}`);
      const auctionId = context.switchToWs().getData().auctionId;
      const key = "rate_limit_exceeded";
      const errorMessage =
        "Rate limit exceeded | Too many bids, please slow down.";

      await this.kafkaService.rateLimitExceeded(key, {
        bidderId: user.sub,
        bidderUsername: user.username,
        auctionId: auctionId,
        errorMessage: errorMessage,
        date: new Date(),
        socketId: client.id,
      });

      throw this.tooManyRequestsException;
    }

    // Add current timestamp
    await this.redisService.zadd(key, { score: now, value: now.toString() });

    return next.handle();
  }
}
