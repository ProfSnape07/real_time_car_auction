// src/auth/guards/ws-connection-auth.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthenticatedSocket } from "../interfaces/socket.interface";
import { KafkaProducerService } from "../../kafka/kafka.producer.service";
import { normalizeIp } from "./ws-connection-rate-limit.guard";

@Injectable()
export class WsConnectionAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsConnectionAuthGuard.name);
  constructor(
    private readonly jwtService: JwtService,
    private readonly kafkaService: KafkaProducerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: AuthenticatedSocket = context.switchToWs().getClient();

    if (client.user) {
      // 'src/auth/guards/ws-connection-rate-limit.guard.ts' has already verified and attached user.
      return true;
    }

    const token = client.handshake.auth?.token as string;

    if (!token) {
      this.logger.warn(
        `Client connection rejected (no auth token): ${client.id}`,
      );
      const error = "Unauthorized: No token provided via handshake auth.";
      client.emit("rejectedConnection", {
        error: error,
      });
      const key = "no_auth_token";
      await this.kafkaService.rejectedSocketConnection(key, {
        socketId: client.id,
        normalizedIp: normalizeIp(client.handshake.address),
        date: new Date(),
        error: error,
      });
      client.disconnect();
      return false;
    }

    // client.user = this.jwtService.verify(token);
    const user = await this.jwtService
      .verifyAsync(token)
      .then((res) => res)
      .catch((_err) => null);

    if (user) {
      client.user = user;
      this.logger.log(`User connected: ${user.username}`);
      return true;
    } else {
      const error = "Unauthorized: Invalid or expired token.";
      client.emit("rejectedConnection", {
        error: error,
      });
      client.disconnect();
      this.logger.warn(
        `Client connection rejected (invalid token): ${client.id}`,
      );
      const key = "invalid_token";
      await this.kafkaService.rejectedSocketConnection(key, {
        socketId: client.id,
        normalizedIp: normalizeIp(client.handshake.address),
        date: new Date(),
        error: error,
      });

      client.disconnect();
      return false;
    }
  }
}
