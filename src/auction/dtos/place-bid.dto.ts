import { IsNumber, IsNotEmpty } from 'class-validator';

export class PlaceBidDto {
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @IsNumber()
  @IsNotEmpty()
  auctionId: number;

}
