// src/constants.ts

// Database
import * as process from "node:process";

export const DATABASE_URL = process.env.DATABASE_URL;

// JWT
export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_EXPIRY = process.env.JWT_EXPIRY;

// Application Port
export const PORT = parseInt(process.env.PORT || "3000", 10); // Default to 3000 if not set

// Redis
export const REDIS_HOST = process.env.REDIS_HOST;
export const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10); // Default to 6379
export const REDIS_PASSWORD = process.env.REDIS_PASSWORD || ""; // Default to empty string if no password
export const REDIS_TTL = parseInt(process.env.REDIS_TTL || "3600", 10); // Default to 3600 seconds (1 hour)

// Kafka
export const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
export const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID;

export const KAFKA_TOPICS = {
  BID_EVENTS: process.env.BID_EVENTS,
  AUCTION_NOTIFICATIONS: process.env.AUCTION_NOTIFICATIONS,
  AUDIT_LOGS: process.env.AUDIT_LOGS,
};

export const KAFKA_CONSUMER_GROUPS = {
  BID_PROCESSOR: process.env.BID_PROCESSOR,
  AUCTION_NOTIFICATIONS_PROCESSOR: process.env.AUCTION_NOTIFICATIONS_PROCESSOR,
  AUDIT_LOGS_PROCESSOR: process.env.AUDIT_LOGS_PROCESSOR,
};


// Rate limiting
export const MAX_SOCKETS_PER_USER = parseInt(process.env.MAX_SOCKETS_PER_USER || "3", 10);
export const MAX_SOCKETS_PER_IP = parseInt(process.env.MAX_SOCKETS_PER_IP || "10", 10);
export const MAX_BIDS = parseInt(process.env.MAX_SOCKETS_PER_USER || "5", 10);
export const WINDOW_SECONDS = parseInt(process.env.MAX_SOCKETS_PER_USER || "10", 10);
