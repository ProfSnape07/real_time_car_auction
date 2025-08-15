// src/kafka/kafka.client.service.ts

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Admin, Kafka, logLevel } from "kafkajs";
import { KAFKA_BROKERS, KAFKA_CLIENT_ID } from "../constants";

@Injectable()
export class KafkaClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaClientService.name);
  private readonly kafka: Kafka;
  private readonly admin: Admin;

  constructor() {
    this.kafka = new Kafka({
      clientId: KAFKA_CLIENT_ID,
      brokers: KAFKA_BROKERS,
      logLevel: logLevel.NOTHING,
    });
    this.admin = this.kafka.admin();
  }

  async onModuleInit() {
    await this.admin.connect();
    this.logger.log("Kafka admin connected.");
  }

  async onModuleDestroy() {
    await this.admin.disconnect();
    this.logger.log("Kafka admin disconnected");
  }

  getKafkaClient(): Kafka {
    return this.kafka;
  }
}
