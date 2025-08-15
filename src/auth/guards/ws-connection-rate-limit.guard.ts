// src/auth/guards/ws-connection-rate-limit.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";
import { MAX_SOCKETS_PER_IP, MAX_SOCKETS_PER_USER } from "../../constants";
import { JwtService } from "@nestjs/jwt";
import { KafkaProducerService } from "../../kafka/kafka.producer.service";

@Injectable()
export class WsConnectionRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WsConnectionRateLimitGuard.name);

  // Max allowed concurrent sockets per user/IP
  private MAX_SOCKETS_PER_USER = MAX_SOCKETS_PER_USER;
  private MAX_SOCKETS_PER_IP = MAX_SOCKETS_PER_IP;

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly kafkaService: KafkaProducerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();

    const ip = client.handshake.address;
    const normalizedIp = normalizeIp(ip);
    const token = client.handshake.auth?.token as string;

    // if (!token) {
    //   return false;
    // }

    const user = await this.jwtService
      .verifyAsync(token)
      .then((res) => res)
      .catch((_err) => null);

    if (user) {
      client.user = user;
      // Check number of sockets per user
      const userSockets = await this.redisService.getSetMembersCount(
        `user:${user.username}:sockets`,
      );
      if (userSockets > this.MAX_SOCKETS_PER_USER) {
        const error = `User ${user.username} exceeded max socket connections.`;
        this.logger.warn(error);
        client.emit("connectionRejected", {
          message: error,
        });

        const key = "max_sockets_per_user";
        await this.kafkaService.maxUserSockets(key, {
          userId: client.user.sub,
          username: client.user.username,
          normalizedIp: normalizedIp,
          date: new Date(),
          error: error,
        });

        client.disconnect();
        return false;
      }
    }

    // Check number of sockets per IP
    const ipSockets = await this.redisService.getSetMembersCount(
      `ip:${normalizedIp}:sockets`,
    );
    if (ipSockets > this.MAX_SOCKETS_PER_IP) {
      const error = `IP ${ip} exceeded max socket connections.`;
      this.logger.warn(error);
      client.emit("connectionRejected", {
        message: error,
      });

      const key = "max_sockets_per_ip";
      await this.kafkaService.maxUserIP(key, {
        normalizedIp: normalizedIp,
        date: new Date(),
        error: error,
      });

      client.disconnect();
      return false;
    }

    return true;
  }
}

export function normalizeIp(ip: string): string {
  if (!ip) return "unknown";

  // Handle IPv6 loopback (::1) → 127.0.0.1
  if (ip === "::1") {
    ip = "localhost";
  }

  // Handle IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  const ipv4Match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Match) {
    ip = ipv4Match[1];
  }

  // Replace colons (IPv6) and dots (IPv4) with underscores
  return ip.replace(/[.:]/g, "_");
}
