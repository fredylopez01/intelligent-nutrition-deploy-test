import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { renderActivationEmailTemplate } from "./templates/activation-email.template.js";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly replyToEmail: string;
  private readonly logoUrl: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("RESEND_API_KEY");
    const fromEmail = this.configService.get<string>("RESEND_FROM_EMAIL");
    const replyToEmail = this.configService.get<string>(
      "RESEND_REPLY_TO_EMAIL",
      "intelligentnutrition.shop@gmail.com",
    );

    if (!apiKey || !fromEmail) {
      throw new Error("Resend configuration variables missing in environment");
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = fromEmail;
    this.replyToEmail = replyToEmail;
    this.logoUrl = this.configService.get<string>(
      "BRAND_LOGO_URL",
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT-YCt7EYTNBdULEoTP2SoK5d9F4-0P1bHmjLAnWSfN8Q&s",
    );
  }

  async sendUserActivationEmail(
    email: string,
    fullName: string,
    activationUrl: string,
  ): Promise<void> {
    const htmlContent = renderActivationEmailTemplate({
      fullName,
      activationUrl,
      logoUrl: this.logoUrl,
    });

    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      replyTo: this.replyToEmail,
      subject: "Activa tu cuenta | Intelligent Nutrition",
      html: htmlContent,
    });

    if (error) {
      this.logger.error(`Failed to send activation email to ${email}`, error);
      throw new InternalServerErrorException("Unable to send activation email");
    }
  }
}
