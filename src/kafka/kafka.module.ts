// src/kafka/kafka.module.ts

import { Global, Module } from "@nestjs/common";
import { KafkaProducerService } from "./kafka.producer.service";
import { KafkaClientService } from "./kafka.client.service";
import { BidEventsConsumerService } from "./consumer/bid-events.consumer.service";
import { AuctionNotificationsConsumerService } from "./consumer/auction-notifications.consumer.service";
import { AuditLogsConsumerService } from "./consumer/audit-logs.consumer.service";
import { PrismaService } from "../prisma/prisma.service";

@Global()
@Module({
  providers: [
    PrismaService,
    KafkaClientService,
    KafkaProducerService,
    BidEventsConsumerService,
    AuctionNotificationsConsumerService,
    AuditLogsConsumerService,
  ],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
