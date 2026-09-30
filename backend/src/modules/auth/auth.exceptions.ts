import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

export const AuthExceptions = {
  invalidCredentials: () =>
    new UnauthorizedException({
      code: "INVALID_CREDENTIALS",
      message: "The provided credentials are invalid.",
    }),
  accountInactive: () =>
    new ForbiddenException({
      code: "ACCOUNT_INACTIVE",
      message: "The user account is inactive.",
    }),
  roleInactive: () =>
    new ForbiddenException({
      code: "ROLE_INACTIVE",
      message: "The assigned role is inactive.",
    }),
  accountNotActivated: () =>
    new ForbiddenException({
      code: "ACCOUNT_NOT_ACTIVATED",
      message: "The user account has not been activated.",
    }),
  invalidActivationToken: () =>
    new BadRequestException({
      code: "INVALID_ACTIVATION_TOKEN",
      message: "The activation token is invalid or has expired.",
    }),
  invalidPasswordResetToken: () =>
    new BadRequestException({
      code: "INVALID_PASSWORD_RESET_TOKEN",
      message: "The password reset link is invalid or has expired.",
    }),
  accountAlreadyActivated: () =>
    new ConflictException({
      code: "ACCOUNT_ALREADY_ACTIVATED",
      message: "The user account is already activated.",
    }),
  userNotFound: () =>
    new NotFoundException({
      code: "USER_NOT_FOUND",
      message: "User account not found.",
    }),
  passwordsAreEqual: () =>
    new BadRequestException({
      code: "PASSWORDS_ARE_EQUAL",
      message: "The new password must be different from the current password.",
    }),
  googleEmailNotRegistered: () =>
    new NotFoundException({
      code: "GOOGLE_EMAIL_NOT_REGISTERED",
      message: "No account is registered with this Google email.",
    }),
  googleAccountInactive: () =>
    new ForbiddenException({
      code: "GOOGLE_ACCOUNT_INACTIVE",
      message: "The account associated with this Google email is inactive.",
    }),
};
