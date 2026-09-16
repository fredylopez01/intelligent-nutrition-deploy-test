import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { CurrentUser } from "./decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../common/interfaces/AuthenticatedUser.js";
import { Public } from "./decorators/public.decorator.js";
import { ActivateAccountDto } from "./dto/activate.dto.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { Roles } from "./decorators/roles.decorator.js";
import { ResendActivationDto } from "./dto/resend-activation.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get("me")
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post("activate")
  @Public()
  async activate(@Body() activateAccountDto: ActivateAccountDto) {
    return this.authService.activateAccount(activateAccountDto);
  }

  @Post("activation/resend")
  @UseGuards(RolesGuard)
  @Roles("SUPER ADMIN")
  async resendActivation(@Body() resendActivationDto: ResendActivationDto) {
    return this.authService.resendActivation(resendActivationDto);
  }
}
