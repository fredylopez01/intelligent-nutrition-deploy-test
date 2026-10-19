import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter.js";
import { ApiResponseInterceptor } from "./common/interceptors/api-response.interceptor.js";
import { BigIntSerializerInterceptor } from "./common/interceptors/bigint-serializer.interceptor.js";

export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(
    new ApiResponseInterceptor(),
    new BigIntSerializerInterceptor(),
  );

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
}
