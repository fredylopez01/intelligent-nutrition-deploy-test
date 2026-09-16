import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("RESEND_API_KEY");

    const fromEmail = this.configService.get<string>("RESEND_FROM_EMAIL");

    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is not configured");
    }

    if (!fromEmail) {
      throw new Error(
        "RESEND_FROM_EMAIL environment variable is not configured",
      );
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = fromEmail;
  }

  async sendUserActivationEmail(
    email: string,
    fullName: string,
    activationUrl: string,
  ): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      subject: "Activate your Intelligent Nutrition account",
      html: `
        <h2>Welcome to Intelligent Nutrition</h2>

        <p>Hello ${fullName},</p>

        <p>
          Your account has been created.
          To activate your account and create your password,
          click the following button:
        </p>

        <p>
          <a
            href="${activationUrl}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#2563eb;
              color:#ffffff;
              text-decoration:none;
              border-radius:6px;
            "
          >
            Activate account
          </a>
        </p>

        <p>
          This activation link is valid for 3 days.
        </p>

        <p>
          If you did not expect this email, you can safely ignore it.
        </p>
      `,
    });

    if (error) {
      this.logger.error(`Failed to send activation email to ${email}`, error);

      throw new InternalServerErrorException("Unable to send activation email");
    }
  }
}
