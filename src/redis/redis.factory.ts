// src/redis/redis.factory.ts

import { Logger } from "@nestjs/common";
import Redis from "ioredis";
import { ConfigService } from "@nestjs/config";
import { REDIS_HOST, REDIS_PASSWORD, REDIS_PORT } from "../constants";

export const redisClientFactory = (_configService: ConfigService) => {
  const logger = new Logger("RedisClientFactory");
  const host = REDIS_HOST;
  const port = REDIS_PORT;
  const password = REDIS_PASSWORD;

  const client = new Redis({
    host,
    port,
    password,
  });

  client.on("error", (err) => logger.error("Redis Client Error", err));
  client.on("connect", () => logger.log("Redis Client Connected"));

  return client;
};
