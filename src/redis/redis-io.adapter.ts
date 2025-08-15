// src/app.module.ts

import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { Logger } from "@nestjs/common";
import Redis from "ioredis";

export class RedisIoAdapter extends IoAdapter {
  protected readonly logger = new Logger(RedisIoAdapter.name);
  protected adapter: any;

  constructor(private readonly redisClient: Redis) {
    super();
  }

  createIOServer(port: number, options?: ServerOptions): any {
    this.logger.log("Creating Redis IO server with adapter");
    const pubClient = this.redisClient.duplicate();
    const subClient = this.redisClient.duplicate();
    this.adapter = createAdapter(pubClient, subClient);
    return super.createIOServer(port, { ...options, adapter: this.adapter });
  }
}
