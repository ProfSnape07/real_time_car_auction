// src/auth/auth.service.ts

import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { User } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { LoginDto } from "./dtos/login.dto";
import { RegisterDto } from "./dtos/register.dto";


export interface UserInfo {
  email: string;
  username: string;
  fullName: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Registers a new user.
   * @param registerDto DTO containing email, username, fullName, and password.
   * @returns The newly created user and a JWT token.
   */
  async register(
    registerDto: RegisterDto,
  ): Promise<{ user: UserInfo; token: string }> {
    const { email, username, fullName, password } = registerDto;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        fullName,
        password: hashedPassword,
      },
    });
    const token = this.generateToken(user);

    const userInfo: UserInfo = {
      email: user.email,
      username: user.username,
      fullName: user.fullName,
    }

    return { user: userInfo, token };
  }

  /**
   * Authenticates a user and generates a JWT token.
   * @param loginDto DTO containing email and password.
   * @returns The authenticated user and a JWT token.
   */
  async login(loginDto: LoginDto): Promise<{ user: UserInfo; token: string }> {
    const { email, password } = loginDto;
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials.");
    }

    const isPasswordMatching = await bcrypt.compare(password, user.password);
    if (!isPasswordMatching) {
      throw new UnauthorizedException("Invalid credentials.");
    }
    const token = this.generateToken(user);

    const userInfo: UserInfo = {
      email: user.email,
      username: user.username,
      fullName: user.fullName,
    }
    return { user: userInfo, token };
  }

  /**
   * Generates a JWT token for a given user.
   * @param user The user object.
   * @returns The generated JWT token string.
   */
  private generateToken(user: User): string {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }
}
