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

@Injectable()
export class AuditLogsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuditLogsConsumerService.name);
  private consumer: Consumer;

  constructor(
    private readonly kafkaClient: KafkaClientService,
    private readonly redisService: RedisService,
  ) {
    this.consumer = this.kafkaClient.getKafkaClient().consumer({
      groupId: KAFKA_CONSUMER_GROUPS.AUDIT_LOGS_PROCESSOR,
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.AUDIT_LOGS,
      fromBeginning: false,
    });
    this.logger.log(`Subscribed to ${KAFKA_TOPICS.AUDIT_LOGS}`);

    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        const payload = JSON.parse(message.value?.toString() || "{}");
        const key = message.key?.toString();
        if (key === "no_auth_token") {
          const socketId = payload.socketId;
          const normalizedIp = payload.normalizedIp;
          const error = payload.error;
          this.logger.log(
            `Received audit log: ${key} socketId: ${socketId} IP: ${normalizedIp} error: ${error}`,
          );
          // Process the bid event here
          // Push into redis ip address, may be twice so instead of 10 only 5 unauthorized request block ip.
        } else if (key === "invalid_token") {
          const socketId = payload.socketId;
          const normalizedIp = payload.normalizedIp;
          const error = payload.error;
          this.logger.log(
            `Received audit log: ${key} socketId: ${socketId} IP: ${normalizedIp} error: ${error}`,
          );
          // Process the bid event here
        } else if (key === "rate_limit_exceeded") {
          const bidderId = payload.bidderId;
          const bidderUsername = payload.bidderUsername;
          const auctionId = payload.auctionId;
          const errorMessage = payload.errorMessage;
          const socketId = payload.socketId;
          this.logger.log(
            `Received audit log: ${key} socketId: ${socketId} bidderId: ${bidderId} bidderUsername: ${bidderUsername} auctionId: ${auctionId}`,
          );
          await this.redisService.publish("emit-to-socket", key, {
            auctionId,
            errorMessage,
            socketId,
          });
        } else if (key === "auction_not_found") {
          const auctionId = payload.auctionId;
          const userId = payload.userId;
          const username = payload.username;
          const normalizedIp = payload.normalizedIp;
          // const date = payload.date;
          // const error = payload.error;
          this.logger.log(
            `Received audit log: ${key} auctionId: ${auctionId} userId: ${userId} username: ${username} IP: ${normalizedIp}`,
          );
        } else if (key === "max_sockets_per_user") {
          const userId = payload.userId;
          const username = payload.username;
          const normalizedIp = payload.normalizedIp;
          // const date = payload.date;
          // const error = payload.error;
          this.logger.log(
            `Received audit log: ${key} userId: ${userId} username: ${username} IP: ${normalizedIp}`,
          );
        } else if (key === "max_sockets_per_ip") {
          const normalizedIp = payload.normalizedIp;
          // const date = payload.date;
          // const error = payload.error;
          this.logger.log(`Received audit log: ${key} IP: ${normalizedIp}`);
        } else {
          // const auctionId = payload.auctionId;
          // const amount = payload.amount;
          // const bidderId = payload.bidderId;
          // const bidderUsername = payload.bidderUsername;
          // const socketId = payload.socketId;
          this.logger.log(`Received audit log: auctionId=${payload.auctionId}`);
          // Process the bid event here
        }
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.stop();
    await this.consumer.disconnect();
    this.logger.log("AuditLogs consumer stopped and disconnected");
  }
}
