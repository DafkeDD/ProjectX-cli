import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module.js'
import { HubModule } from './hub/hub.module.js'

@Module({ imports: [HealthModule, HubModule] })
export class AppModule {}
