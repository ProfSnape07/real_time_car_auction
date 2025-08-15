import { IsNotEmpty, IsNumber } from "class-validator";

/**
 * DTO for joining an auction.
 * Also used for ending an auction to maintain consistency.
 */
export class AuctionDto {
  @IsNumber()
  @IsNotEmpty()
  auctionId: number;
}
