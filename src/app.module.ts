import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PositionsModule } from './modules/positions/positions.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { TimeOffModule } from './modules/time-off/time-off.module';
import { PrismaService } from './prisma.service';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { CronModule } from './modules/cron/cron.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { CommonModule } from './common/common.module';
import { LocationsModule } from './modules/locations/locations.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    AuthModule,
    OrganizationModule,
    PositionsModule,
    EmployeesModule,
    SchedulingModule,
    TimeOffModule,
    TimeTrackingModule,
    NotificationsModule,
    AnalyticsModule,
    PayrollModule,
    CronModule,
    RealtimeModule,
    LocationsModule,
  ],
  controllers: [],
  providers: [PrismaService],
  exports: [PrismaService],

})
export class AppModule { }