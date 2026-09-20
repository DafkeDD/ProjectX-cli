import { Module } from '@nestjs/common'
import { AdminTokensController } from './admin-tokens.controller.js'
import { AppsController } from './apps.controller.js'
import { AuthController } from './auth.controller.js'
import { InteractionController } from './interaction.controller.js'

/** De SSO-hub: registreren/inloggen, het inlogscherm voor apps en het beheerpaneel. */
@Module({ controllers: [AuthController, InteractionController, AdminTokensController, AppsController] })
export class HubModule {}
