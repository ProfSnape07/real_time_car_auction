// src/redis/redis.module.ts

import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ConfigService } from '@nestjs/config';
import { redisClientFactory } from './redis.factory';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_PUBLISHER_CLIENT',
      useFactory: (configService: ConfigService) => redisClientFactory(configService),
      inject: [ConfigService],
    },
    {
      provide: 'REDIS_SUBSCRIBER_CLIENT',
      useFactory: (configService: ConfigService) => redisClientFactory(configService),
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [RedisService],
})
export class RedisModule {}
