// File: src/auction/auction.gateway.ts

import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  Logger,
  OnModuleInit,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Server } from "socket.io";
import { AuctionService } from "./auction.service";
import { PlaceBidDto } from "./dtos/place-bid.dto";
import { AuthenticatedSocket } from "../auth/interfaces/socket.interface";
import { WsConnectionAuthGuard } from "../auth/guards/ws-connection-auth.guard";
import { WsRolesGuard } from "../auth/guards/ws-roles.guard";
import { Roles } from "../auth/roles";
import { AuctionDto } from "./dtos/auction.dto";
import { RedisService } from "../redis/redis.service";
import {
  normalizeIp,
  WsConnectionRateLimitGuard,
} from "../auth/guards/ws-connection-rate-limit.guard";
import { BidThrottleInterceptor } from "./interceptors/bid-throttle.interceptor";
import { KafkaProducerService } from "../kafka/kafka.producer.service";

@WebSocketGateway({ cors: true, namespace: "/auction" })
@UsePipes(new ValidationPipe())
@UseGuards(WsConnectionAuthGuard)
@UseGuards(WsConnectionRateLimitGuard)
export class AuctionGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AuctionGateway.name);

  constructor(
    private readonly auctionService: AuctionService,
    private readonly redisService: RedisService,
    private readonly kafkaService: KafkaProducerService,
  ) {}

  /**
   * Called once the module has been initialized.
   * Sets the Socket.IO server instance in the RedisService.
   */
  onModuleInit() {
    this.redisService.setSocketIoServer(this.server);
  }

  /**
   * Handles new WebSocket connections.
   * This method is called after WsConnectionAuthGuard has successfully authenticated the client.
   * @param client The connected client socket.
   */
  async handleConnection(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    this.logger.log(`Client connected: ${client.id}`);
  }

  /**
   * Handles WebSocket disconnections.
   * @param client The disconnected client socket.
   */
  async handleDisconnect(
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    this.logger.log(`Client disconnected: ${client.id}`);
    client.disconnect();
    await this.redisService.unregisterSocket(client.id);
  }

  /**
   * Handles the 'joinAuction' event.
   * The WsAuthGuard is no longer needed here as the connection is already authenticated.
   * @param client The client socket.
   * @param data The payload containing the auctionId.
   */
  @SubscribeMessage("joinAuction")
  async handleJoinAuction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: AuctionDto,
  ): Promise<void> {
    const { auctionId } = data;
    const auctionState = await this.auctionService.getAuctionState(auctionId);

    if (!auctionState.exist) {
      client.emit("connectionRejected", {
        auctionId,
        message: `Auction with auctionId: ${auctionId} not found.`,
      });
      client.disconnect();

      const key = "auction_not_found";
      await this.kafkaService.noAuctionRoom(key, {
        auctionId: auctionId,
        userId: client.user.sub,
        username: client.user.username,
        normalizedIp: normalizeIp(client.handshake.address),
        date: new Date(),
        error: `Auction with auctionId: ${auctionId} not found.`,
      });
      return;
    }

    // const online = await this.redisService.getOnlineUsers();
    // client.emit("onlineUsers", online);

    const onlineInAuctionID = await this.redisService.onlineInAuctionID(auctionId);
    client.emit("onlineUsers", onlineInAuctionID);


    await this.redisService.registerSocket(
      client.user.username,
      client.id,
      normalizeIp(client.handshake.address),
      auctionId,
    );

    client.join(auctionId.toString());

    this.logger.log(
      `User joined Auction Room | Auction ID: ${auctionId} | Bidder: ${client.user.username}`,
    );

    client.emit("auctionState", {
      auctionId,
      currentHighestBid: {
        amount: auctionState.currentHighestBid,
        bidderId: auctionState.winnerId,
        bidderUsername: auctionState.winnerUsername,
      },
      isClosed: !auctionState.isOpen,
    });
    if (!auctionState.isOpen) {
      client.disconnect();
    }
  }

  /**
   * Handles the 'placeBid' event.
   * The WsAuthGuard is no longer needed here.
   * @param client The client socket.
   * @param data The PlaceBidDto payload (now does not need bidderId).
   */
  @UseInterceptors(BidThrottleInterceptor)
  @SubscribeMessage("placeBid")
  async handlePlaceBid(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: PlaceBidDto,
  ): Promise<void> {
    const { auctionId, amount } = data;
    const bidderId = client.user.sub;
    const bidderUsername = client.user.username;

    await this.kafkaService.produceBidEvent(auctionId, {
      auctionId,
      amount,
      bidderId,
      bidderUsername,
      socketId: client.id,
    });

    await this.kafkaService.produceNotificationsEvent(auctionId, {
      auctionId,
      amount,
      bidderId,
      bidderUsername,
      socketId: client.id,
    });

    await this.kafkaService.produceAuditEvent(auctionId, {
      auctionId,
      amount,
      bidderId,
      bidderUsername,
      socketId: client.id,
    });

    this.logger.log(`Bid event produced to Kafka | Auction ID: ${auctionId}`);
  }

  /**
   * A new endpoint to allow an 'admin' to end an auction.
   * @param client The authenticated client socket.
   * @param data The payload containing the auctionId.
   */
  @UseGuards(WsRolesGuard)
  @Roles("admin")
  @SubscribeMessage("endAuction")
  async handleEndAuction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: AuctionDto,
  ): Promise<void> {
    this.logger.log(
      `Admin action: Ending auction | Auction ID: ${data.auctionId} | Admin: '${client.user.username}'`,
    );

    const result = await this.auctionService.endAuction(data.auctionId);

    if (!result.success) {
      client.emit("auctionEndRejected", {
        auctionId: data.auctionId,
        message: result.message,
      });
      return;
    }
    this.logger.log(
      `Auction end processed and published to Redis | Auction ID: ${data.auctionId}`,
    );
  }
}
