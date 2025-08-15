// src/main.ts

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { PORT } from "./constants";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);



  // app.useWebSocketAdapter();

  app.enableCors();

  app.useGlobalPipes(new ValidationPipe());

  await app.listen(PORT);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap().catch((err) => {
  console.log("Application failed to start", err);
});
