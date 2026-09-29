import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
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

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
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

  @Post("resend")
  @Roles("SUPERADMIN", "DEV")
  @HttpCode(HttpStatus.OK)
  resendActivation(@Body() resendActivationDto: ResendActivationDto) {
    return this.authService.resendActivation(resendActivationDto);
  }
}
