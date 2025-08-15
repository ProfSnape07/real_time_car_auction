// src/auth/auth.controller.ts

import {
  Body,
  ConflictException,
  Controller,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService, UserInfo } from "./auth.service";
import { LoginDto } from "./dtos/login.dto";
import { RegisterDto } from "./dtos/register.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<{ user: UserInfo; token: string }> {
    try {
      const { user, token } = await this.authService.register(registerDto);
      return { user, token };
    } catch (error) {
      if (error.code === "P2002") {
        console.log(error.message);
        throw new ConflictException("Email already in use.");
      }
      throw error;
    }
  }

  @Post("login")
  async login(
    @Body() loginDto: LoginDto,
  ): Promise<{ user: UserInfo; token: string }> {
    const { user, token } = await this.authService.login(loginDto);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials.");
    }
    return { user, token };
  }
}
