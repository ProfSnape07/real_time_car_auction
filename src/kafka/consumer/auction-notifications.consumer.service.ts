import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Consumer, EachMessagePayload } from "kafkajs";
import { KafkaClientService } from "../kafka.client.service";
import { KAFKA_CONSUMER_GROUPS, KAFKA_TOPICS } from "../../constants";

@Injectable()
export class AuctionNotificationsConsumerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(
    AuctionNotificationsConsumerService.name,
  );
  private consumer: Consumer;

  constructor(private kafkaClient: KafkaClientService) {
    this.consumer = this.kafkaClient.getKafkaClient().consumer({
      groupId: KAFKA_CONSUMER_GROUPS.AUCTION_NOTIFICATIONS_PROCESSOR,
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.AUCTION_NOTIFICATIONS,
      fromBeginning: false,
    });
    this.logger.log(`Subscribed to ${KAFKA_TOPICS.AUCTION_NOTIFICATIONS}`);

    await this.consumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        const payload = JSON.parse(message.value?.toString() || "{}");
        // const auctionId = payload.auctionId;
        // const amount = payload.amount;
        // const bidderId = payload.bidderId;
        // const bidderUsername = payload.bidderUsername;
        // const socketId = payload.socketId;

        this.logger.log(
          `Received auction notification: auctionId=${payload.auctionId}`,
        );
        // Process the bid event here
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.stop();
    await this.consumer.disconnect();
    this.logger.log("AuctionNotifications consumer stopped and disconnected");
  }
}
