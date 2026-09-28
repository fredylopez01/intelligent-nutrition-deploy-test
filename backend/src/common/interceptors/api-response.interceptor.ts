import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { map, Observable } from "rxjs";

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<{ data: unknown }> {
    return next.handle().pipe(map((data: unknown) => ({ data })));
  }
}
