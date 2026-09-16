import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";

export class CryptoUtil {
  static generateRandomToken(bytes = 32): string {
    return randomBytes(bytes).toString("hex");
  }

  static hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  static getExpirationDate(minutes: number): Date {
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  static buildActivationUrl(
    configService: ConfigService,
    rawToken: string,
  ): string {
    const frontendUrl = configService.get<string>("FRONTEND_URL");

    if (!frontendUrl) {
      throw new Error("FRONTEND_URL environment variable is not configured");
    }

    return `${frontendUrl}/activate-account?token=${encodeURIComponent(rawToken)}`;
  }
}
