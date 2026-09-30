import {
  Injectable,
  ServiceUnavailableException,
  ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (
      !this.configService.get<string>("GOOGLE_CLIENT_ID") ||
      !this.configService.get<string>("GOOGLE_CLIENT_SECRET")
    ) {
      throw new ServiceUnavailableException({
        code: "GOOGLE_OAUTH_NOT_CONFIGURED",
        message: "Google sign-in is not configured on this server.",
      });
    }

    return super.canActivate(context);
  }
}
