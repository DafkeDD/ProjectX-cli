import { Module } from '@nestjs/common'
import { HubController } from './hub.controller.js'

/** Events van de SSO-hub. */
@Module({ controllers: [HubController] })
export class HubModule {}
