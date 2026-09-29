import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map, Observable } from "rxjs";
import { PRESERVE_API_ENVELOPE } from "../decorators/preserve-api-envelope.decorator.js";

function isPaginatedResponse(
  value: unknown,
): value is { data: unknown[]; meta: unknown } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const response = value as { data?: unknown; meta?: unknown };
  return Array.isArray(response.data) && response.meta !== undefined;
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<{ data: unknown }> {
    const preserveEnvelope = Reflect.getMetadata(
      PRESERVE_API_ENVELOPE,
      _context.getHandler(),
    );
    return next.handle().pipe(
      map((data: unknown) => {
        if (preserveEnvelope) {
          return { data };
        }
        return isPaginatedResponse(data) ? data : { data };
      }),
    );
  }
}
