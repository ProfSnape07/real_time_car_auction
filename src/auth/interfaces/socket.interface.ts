// File: src/auth/interfaces/socket.interface.ts

import { Socket } from 'socket.io';

export interface AuthenticatedSocket extends Socket {
  user: {
    sub: number;
    username: string;
    role: 'ADMIN' | 'USER';
  };
}
