import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : undefined;
    const responseBody =
      typeof exceptionResponse === "object" && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>)
        : undefined;
    const rawMessage =
      typeof exceptionResponse === "string"
        ? exceptionResponse
        : responseBody?.message;
    const message =
      typeof rawMessage === "string"
        ? rawMessage
        : Array.isArray(rawMessage)
          ? "Request validation failed."
          : "Request failed.";

    response.status(status).json({
      error: {
        code:
          typeof responseBody?.code === "string"
            ? responseBody.code
            : (HttpStatus[status] ?? `HTTP_${status}`),
        message,
        details:
          responseBody?.details ??
          (Array.isArray(rawMessage) ? rawMessage : {}),
      },
    });
  }
}
