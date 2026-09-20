import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js'

/** Inloggen via de SSO-hub. */
@Module({ controllers: [AuthController] })
export class AuthModule {}
