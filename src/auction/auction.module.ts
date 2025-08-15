// src/auction/auction.module.ts

import { Module } from '@nestjs/common';
import { AuctionController } from './auction.controller';
import { AuctionService } from './auction.service';
import { AuctionGateway } from './auction.gateway';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { KafkaModule } from '../kafka/kafka.module';

@Module({
  imports: [
    AuthModule,
    RedisModule,
    PrismaModule,
    KafkaModule,
  ],
  controllers: [AuctionController],
  providers: [AuctionService, AuctionGateway],
})
export class AuctionModule {}
