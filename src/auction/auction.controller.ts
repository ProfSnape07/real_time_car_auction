// src/auction/auction.controller.ts

import { Controller, Get } from "@nestjs/common";
import { AuctionService } from "./auction.service";
import { Auction } from "@prisma/client";

@Controller("auctions")
export class AuctionController {
  constructor(private readonly auctionService: AuctionService) {}

  @Get()
  async findAll(): Promise<Auction[]> {
    return await this.auctionService.findAll();
  }
}
