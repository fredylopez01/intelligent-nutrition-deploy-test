import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { ActivateAccountDto } from "./dto/activate.dto.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { ResendActivationDto } from "./dto/resend-activation.dto.js";
import { ForgotPasswordDto } from "./dto/forgot-password.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { ChangePasswordDto } from "./dto/change-password.dto.js";
import { GoogleAuthGuard } from "./guards/google-auth.guard.js";
import type { GoogleOAuthUser } from "./strategies/google.strategy.js";

function getGoogleErrorCode(error: unknown) {
  if (!(error instanceof HttpException)) {
    return "GOOGLE_AUTH_FAILED";
  }

  const response = error.getResponse();
  if (typeof response === "object" && response !== null && "code" in response) {
    const code = response.code;
    if (
      code === "GOOGLE_EMAIL_NOT_REGISTERED" ||
      code === "GOOGLE_ACCOUNT_INACTIVE" ||
      code === "ROLE_INACTIVE"
    ) {
      return code;
    }
  }

  return "GOOGLE_AUTH_FAILED";
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get("google")
  @Public()
  @UseGuards(GoogleAuthGuard)
  googleLogin() {}

  @Get("google/callback")
  @Public()
  @UseGuards(GoogleAuthGuard)
  async googleLoginCallback(
    @Req() request: Request & { user: GoogleOAuthUser },
    @Res() response: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:5173";

    try {
      const { accessToken } = await this.authService.loginWithGoogle(
        request.user.email,
      );
      const callbackUrl = new URL("/auth/google/callback", frontendUrl);
      callbackUrl.hash = new URLSearchParams({ accessToken }).toString();
      return response.redirect(callbackUrl.toString());
    } catch (error) {
      const loginUrl = new URL("/login", frontendUrl);
      loginUrl.searchParams.set("authError", getGoogleErrorCode(error));
      return response.redirect(loginUrl.toString());
    }
  }

  @Get("me")
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post("activate")
  @Public()
  @HttpCode(HttpStatus.OK)
  activate(@Body() activateAccountDto: ActivateAccountDto) {
    return this.authService.activateAccount(activateAccountDto);
  }

  @Post("forgot-password")
  @Public()
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post("reset-password")
  @Public()
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, changePasswordDto);
  }

  @Post("resend")
  @Roles("SUPERADMIN", "DEV")
  @HttpCode(HttpStatus.OK)
  resendActivation(@Body() resendActivationDto: ResendActivationDto) {
    return this.authService.resendActivation(resendActivationDto);
  }
}
