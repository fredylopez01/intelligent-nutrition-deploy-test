import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ValidationPipe } from "@nestjs/common";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter.js";
import { ApiResponseInterceptor } from "./common/interceptors/api-response.interceptor.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, "0.0.0.0");
}
bootstrap();
