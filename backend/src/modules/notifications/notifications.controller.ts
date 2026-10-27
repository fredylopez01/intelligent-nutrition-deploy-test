import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import type { AuthenticatedUser } from "../../common/interfaces/AuthenticatedUser.js";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto.js";
import { NotificationsService } from "./notifications.service.js";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findMine(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.notificationsService.findMine(currentUser.id, query);
  }

  @Get("unread-count")
  unreadCount(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notificationsService.unreadCount(currentUser.id);
  }

  @Patch(":notificationId/read")
  markRead(
    @Param("notificationId", new ParseUUIDPipe()) notificationId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.notificationsService.markRead(currentUser.id, notificationId);
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.notificationsService.markAllRead(currentUser.id);
  }
}
