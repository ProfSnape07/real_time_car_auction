// src/auth/guards/ws-roles.guard.ts

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedSocket } from '../interfaces/socket.interface';
import { WsException } from '@nestjs/websockets';

@Injectable()
export class WsRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.get<string>(
      'roles',
      context.getHandler(),
    );

    if (!requiredRole) {
      return true;
    }

    const client: AuthenticatedSocket = context.switchToWs().getClient();
    const userRole = client.user?.role;

    if (!userRole) {
      throw new WsException('Forbidden: User role not found.');
    }

    if (requiredRole !== userRole) {
      throw new WsException('Forbidden: Insufficient permissions.');
    }

    return true;
  }
}
