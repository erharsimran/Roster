import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './modules/auth/auth.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PositionsModule } from './modules/positions/positions.module';
@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    }),
    ConfigModule.forRoot({
      isGlobal: true, // makes env vars available across all modules
    }),
    AuthModule,
    SchedulingModule,
    OrganizationModule,
    PositionsModule,
    // TimeAttendanceModule, MessagingModule, AuthModule to follow the same pattern —
    // scaffold those next once this module is verified end-to-end.
  ],
})
export class AppModule { }
