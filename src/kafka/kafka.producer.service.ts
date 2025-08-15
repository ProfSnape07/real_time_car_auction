import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Producer } from "kafkajs";
import { KafkaClientService } from "./kafka.client.service";
import { KAFKA_BROKERS, KAFKA_TOPICS } from "../constants";
import {
  KafkaAuditRateLimitExceeded,
  KafkaNewBid,
  MaxUserIP,
  MaxUserSockets,
  NoAuctionRoom,
  RejectedSocketConnection,
} from "./interface";

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer;

  constructor(private readonly kafkaClient: KafkaClientService) {
    this.producer = this.kafkaClient.getKafkaClient().producer();
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log(`Kafka producer connected to brokers: ${KAFKA_BROKERS}`);
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    this.logger.log("Kafka producer disconnected");
  }

  /**
   * Generic producer method for any topic.
   */
  async produce(topic: string, auctionId: number, payload: KafkaNewBid) {
    this.logger.log(
      `Producing message to topic = "${topic}" auctionId=${auctionId}`,
    );
    await this.producer.send({
      topic,
      messages: [
        {
          key: auctionId.toString(),
          value: JSON.stringify(payload),
          partition: auctionId,
        },
      ],
    });
    this.logger.log(
      `Message sent to topic = "${topic}" auctionId=${auctionId}`,
    );
  }

  /**
   * Produce a new bid event keyed by auctionId for partitioning.
   */
  async produceBidEvent(auctionId: number, payload: KafkaNewBid) {
    await this.produce(KAFKA_TOPICS.BID_EVENTS, auctionId, payload);
  }

  /**
   * Produce a notifications event keyed by auctionId for partitioning.
   */
  async produceNotificationsEvent(auctionId: number, payload: KafkaNewBid) {
    await this.produce(KAFKA_TOPICS.AUCTION_NOTIFICATIONS, auctionId, payload);
  }

  /**
   * Produce an audit event keyed by auctionId for partitioning.
   */
  async produceAuditEvent(auctionId: number, payload: KafkaNewBid) {
    await this.produce(KAFKA_TOPICS.AUDIT_LOGS, auctionId, payload);
  }

  /**
   * Produce an audit event in partition 0 for rejected socket connections.
   */
  async rejectedSocketConnection(
    key: string,
    payload: RejectedSocketConnection,
  ) {
    await this.producer.send({
      topic: KAFKA_TOPICS.AUDIT_LOGS,
      messages: [
        {
          key: key,
          value: JSON.stringify(payload),
          partition: 0,
        },
      ],
    });
    this.logger.log(
      `Message sent to topic=${KAFKA_TOPICS.AUDIT_LOGS} for ${key}`,
    );
  }

  async rateLimitExceeded(key: string, payload: KafkaAuditRateLimitExceeded) {
    await this.producer.send({
      topic: KAFKA_TOPICS.AUDIT_LOGS,
      messages: [
        {
          key: key,
          value: JSON.stringify(payload),
          partition: 0,
        },
      ],
    });
    this.logger.log(
      `Message sent to topic=${KAFKA_TOPICS.AUDIT_LOGS} for ${key}`,
    );
  }

  async noAuctionRoom(key: string, payload: NoAuctionRoom) {
    await this.producer.send({
      topic: KAFKA_TOPICS.AUDIT_LOGS,
      messages: [
        {
          key: key,
          value: JSON.stringify(payload),
          partition: 0,
        },
      ],
    });
    this.logger.log(
      `Message sent to topic=${KAFKA_TOPICS.AUDIT_LOGS} for ${key}`,
    );
  }

  async maxUserSockets(key: string, payload: MaxUserSockets) {
    await this.producer.send({
      topic: KAFKA_TOPICS.AUDIT_LOGS,
      messages: [
        {
          key: key,
          value: JSON.stringify(payload),
          partition: 0,
        },
      ],
    });
    this.logger.log(
      `Message sent to topic=${KAFKA_TOPICS.AUDIT_LOGS} for ${key}`,
    );
  }

  async maxUserIP(key: string, payload: MaxUserIP) {
    await this.producer.send({
      topic: KAFKA_TOPICS.AUDIT_LOGS,
      messages: [
        {
          key: key,
          value: JSON.stringify(payload),
          partition: 0,
        },
      ],
    });
    this.logger.log(
      `Message sent to topic=${KAFKA_TOPICS.AUDIT_LOGS} for ${key}`,
    );
  }
}
