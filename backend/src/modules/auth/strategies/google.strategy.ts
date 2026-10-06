import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, type Profile } from "passport-google-oauth20";

export interface GoogleOAuthUser {
  email: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(configService: ConfigService) {
    super({
      clientID:
        configService.get<string>("GOOGLE_CLIENT_ID") || "not-configured",
      clientSecret:
        configService.get<string>("GOOGLE_CLIENT_SECRET") || "not-configured",
      callbackURL: configService.get<string>(
        "GOOGLE_CALLBACK_URL",
        "http://localhost:3000/api/v1/auth/google/callback",
      ),
      scope: ["email", "profile"],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): GoogleOAuthUser {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException({
        code: "GOOGLE_EMAIL_UNAVAILABLE",
        message: "Google did not provide an email address for this account.",
      });
    }

    return { email };
  }
}
