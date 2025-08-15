// src/redis/redis.service.ts

import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import Redis from "ioredis";
import { Server } from "socket.io";
import { REDIS_TTL } from "../constants";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private socketIoServer: Server;

  constructor(
    @Inject("REDIS_PUBLISHER_CLIENT") private readonly redisPublisher: Redis,
    @Inject("REDIS_SUBSCRIBER_CLIENT") private readonly redisSubscriber: Redis,
  ) {}

  /**
   * Sets the Socket.IO server instance.
   * @param server The Socket.IO server instance.
   */
  setSocketIoServer(server: Server) {
    this.socketIoServer = server;
    this.logger.log("Socket.IO server instance set in RedisService.");
  }

  async onModuleInit() {
    this.redisSubscriber.psubscribe("auction_updates:*", (err) => {
      if (err) {
        this.logger.error(
          `Failed to subscribe to auction_updates:*: ${err.message}`,
        );
      } else {
        this.logger.log(`Subscribed to Redis channels for auction updates.`);
      }
    });

    const channels = ["session_updates", "emit-to-socket"];
    await this.redisSubscriber.subscribe(...channels, (err) => {
      if (err) {
        this.logger.error(
          `Failed to subscribe to Redis channels: ${err.message}`,
        );
      } else {
        this.logger.log(`Subscribed to Redis channels: ${channels.join(", ")}`);
      }
    });

    // Existing auction pmessage handler
    this.redisSubscriber.on("pmessage", (_pattern, channel, message) => {
      const parsedMessage = JSON.parse(message);
      const { event, data } = parsedMessage;
      const auctionId = data?.auctionId;

      if (event === "newBid") {
        const { newBid } = data;
        this.logger.log(
          `Broadcasting 'newBid' event | Auction ID: ${auctionId} | Amount: ${newBid.amount}`,
        );
        this.socketIoServer.to(auctionId.toString()).emit("newBid", {
          auctionId,
          newBid: {
            amount: newBid.amount,
            bidderId: newBid.bidderId,
            bidderUsername: newBid.bidderUsername,
            timestamp: newBid.timestamp,
          },
        });
      } else if (event === "auctionEnd") {
        const { winningBid, message: endMessage } = data;
        this.logger.log(
          `Broadcasting 'auctionEnd' event | Auction ID: ${auctionId}`,
        );
        this.socketIoServer.to(auctionId.toString()).emit("auctionEnd", {
          auctionId,
          winningBid: {
            amount: winningBid.amount,
            userId: winningBid.userId,
            username: winningBid.username,
          },
          message: endMessage,
        });
        this.socketIoServer.in(auctionId.toString()).disconnectSockets();
      }
    });

    // session_updates handler (regular subscribe)
    this.redisSubscriber.on("message", async (channel, message) => {
      if (channel === "session_updates") {
        const parsed = JSON.parse(message);
        const { event, data } = parsed;

        const auctionId = data.auctionId;

        this.socketIoServer.in(auctionId.toString()).emit("presenceDelta", {
          event,
          data: {
            username: data.username,
            lastSeen: data.lastSeen,
          },
        });

        // const members = await this.redisPublisher.smembers(`auction:${auctionId}:sockets`) || [];

        // for (const member of members) {
        //   this.socketIoServer.in
        // }

        // this.socketIoServer.emit("presenceDelta", { event, data });
      } else if (channel === "emit-to-socket") {
        const parsed = JSON.parse(message);
        const auctionId = parsed.data.auctionId;
        const errorMessage = parsed.data.errorMessage;
        const socketId = parsed.data.socketId;

        this.socketIoServer.to(socketId).emit("bidRejected", {
          auctionId,
          message: errorMessage,
        });
      }
    });
  }

  async onModuleDestroy() {
    await this.redisSubscriber.punsubscribe("auction_updates:*");
    await this.redisSubscriber.unsubscribe("session_updates", "emit-to-socket");

    this.redisSubscriber.quit();
    this.redisPublisher.quit();
    this.logger.log("Redis clients disconnected.");
  }

  /**
   * Publishes a message to a Redis channel.
   * @param channel The Redis channel to publish to.
   * @param event The type of event to publish.
   * @param data The data payload for the event.
   */
  async publish(channel: string, event: string, data: any): Promise<void> {
    const payload = JSON.stringify({ event, data });
    await this.redisPublisher.publish(channel, payload);
    this.logger.log(`Published to channel '${channel}' | Event: ${event}`);
  }

  /**
   * Retrieves data from the cache.
   * @param key The cache key.
   * @returns The cached data or null if not found.
   */
  async getCache<T>(key: string): Promise<T | undefined> {
    const cachedData = await this.redisPublisher.get(key);
    return cachedData ? JSON.parse(cachedData) : undefined;
  }

  /**
   * Stores data in the cache.
   * @param key The cache key.
   * @param value The data to store.
   * @param ttl Optional TTL in seconds.
   */
  async setCache<T>(
    key: string,
    value: T,
    ttl: number = REDIS_TTL,
  ): Promise<void> {
    const serializedValue = JSON.stringify(value);
    await this.redisPublisher.set(key, serializedValue, "EX", ttl);
  }

  /**
   * Session management methods
   */

  /**
   * Register a socket for a user:
   * - socket:{socketId}:username → username
   * - Add socketId to user:{username}:sockets set
   * - Set TTL for socket and user socket set
   * - Add username to online_users set
   * - Save socket:{socketId}:ip
   * - Add socketId to ip:{ip}:sockets set
   * - Publish "user_online" event
   */

  async registerSocket(
    username: string,
    socketId: string,
    ip: string,
    auctionId: number,
  ): Promise<void> {
    const multi = this.redisPublisher.multi();

    // rate-limiting
    multi.sadd(`ip:${ip}:sockets`, socketId);
    multi.expire(`ip:${ip}:sockets`, REDIS_TTL);
    multi.set(`socket:${socketId}:ip`, ip, "EX", REDIS_TTL);
    multi.sadd(`user:${username}:sockets`, socketId);
    multi.expire(`user:${username}:sockets`, REDIS_TTL);

    // session management
    multi.set(`socket:${socketId}:username`, username, "EX", REDIS_TTL);
    multi.set(`socket:${socketId}:auctionId`, auctionId, "EX", REDIS_TTL);

    // multi.sadd(`auction:${auctionId}:sockets`, socketId);
    // multi.expire(`auction:${auctionId}:sockets`, REDIS_TTL);

    multi.sadd(`auction:${auctionId}:username`, username);
    multi.expire(`auction:${auctionId}:username`, REDIS_TTL);

    multi.sadd(`user:${username}:${auctionId}`, socketId);
    multi.expire(`user:${username}:${auctionId}`, REDIS_TTL);

    // multi.sadd("online_users", username);
    // multi.expire(`online_users`, REDIS_TTL);
    await multi.exec();

    // publish presence change
    await this.publish("session_updates", "user_online", {
      auctionId: auctionId,
      username: username,
      lastSeen: Date.now(),
    });
    this.logger.log(
      `Registered socket ${socketId} for user: ${username} with IP: ${ip}`,
    );
  }

  /**
   * Unregister a socket:
   * - Read socket:{socketId} → username
   * - Delete socket:{socketId}, socket:{socketId}:ip
   * - Remove socketId from user:{username}:sockets
   * - Remove socketId from ip:{ip}:sockets
   * - If no sockets remain for user:
   *   - Remove username from online_users set
   *   - Publish "user_offline" event
   * - If user still has sockets, refresh TTL
   */

  async unregisterSocket(socketId: string): Promise<void> {
    const username = await this.redisPublisher.get(
      `socket:${socketId}:username`,
    );
    if (!username) {
      this.logger.error(`${socketId} was not registered.`);
      return;
    }

    const ip = await this.redisPublisher.get(`socket:${socketId}:ip`);
    const auctionId = await this.redisPublisher.get(
      `socket:${socketId}:auctionId`,
    );

    const multi = this.redisPublisher.multi();

    // rate-limiting
    multi.srem(`ip:${ip}:sockets`, socketId);
    // multi.expire(`ip:${ip}:sockets`, REDIS_TTL);
    multi.del(`socket:${socketId}:ip`);
    multi.srem(`user:${username}:sockets`, socketId);
    // multi.expire(`user:${username}:sockets`, REDIS_TTL);

    // session management
    multi.del(`socket:${socketId}:username`);
    multi.del(`socket:${socketId}:auctionId`);

    // multi.srem(`auction:${auctionId}:sockets`, socketId);
    // multi.expire(`auction:${auctionId}:sockets`, REDIS_TTL);

    multi.srem(`user:${username}:${auctionId}`, socketId);
    // multi.expire(`user:${username}:${auctionId}`, REDIS_TTL);

    // multi.del(`socket:${socketId}:username`);
    // multi.del(`socket:${socketId}:auctionId`);
    // multi.del(`socket:${socketId}:ip`);
    // multi.srem(`ip:${ip}:sockets`, socketId);
    // multi.srem(`user:${username}:sockets`, socketId);

    await multi.exec();

    // Check remaining user sockets
    const remainingSockets = await this.redisPublisher.scard(
      `user:${username}:${auctionId}`,
    );

    if (remainingSockets === 0) {
      // await this.redisPublisher.srem("online_users", username);

      this.redisPublisher.srem(`auction:${auctionId}:username`, username);
      // multi.expire(`auction:${auctionId}:username`, REDIS_TTL);

      await this.publish("session_updates", "user_offline", {
        auctionId: auctionId,
        username: username,
        lastSeen: Date.now(),
      });
      this.logger.log(
        `User: ${username} is now offline from auction:${auctionId}`,
      );
    }
    // else {
    //   await this.redisPublisher.expire(`auction:${auctionId}:username`, REDIS_TTL);
    //   this.logger.log(
    //     `Socket ${socketId} removed for user: ${username}. ${remainingSockets} socket(s) remain.`,
    //   );
    // }
  }

  /**
   * Returns username for a given socketId if present.
   */
  async getUsernameIdBySocket(socketId: string): Promise<string | null> {
    return this.redisPublisher.get(`socket:${socketId}username`);
  }

  /**
   * Returns array of socketIds for a given username.
   */
  async getSocketsByUsername(username: string): Promise<string[]> {
    const members = await this.redisPublisher.smembers(
      `user:${username}:sockets`,
    );
    return members || [];
  }

  // /**
  //  * Returns a list of currently online userIds (strings).
  //  */
  // async getOnlineUsers(): Promise<string[]> {
  //   const members = await this.redisPublisher.smembers("online_users");
  //   return members || [];
  // }

  /**
   * Returns a list of currently online username in given auction room.
   */
  async onlineInAuctionID(auctionId: number): Promise<string[]> {
    const members = await this.redisPublisher.smembers(
      `auction:${auctionId}:username`,
    );
    return members || [];
  }

  async getSetMembersCount(key: string): Promise<number> {
    return this.redisPublisher.scard(key);
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    return this.redisPublisher.zremrangebyscore(key, min, max);
  }

  async zcard(key: string): Promise<number> {
    return this.redisPublisher.zcard(key);
  }

  async zadd(
    key: string,
    member: { score: number; value: string },
  ): Promise<number> {
    const result = this.redisPublisher.zadd(key, member.score, member.value);
    await this.redisPublisher.expire(key, REDIS_TTL);
    return result;
  }
}
