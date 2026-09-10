import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { PositionsModule } from './modules/positions/positions.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { PrismaService } from './prisma.service';
import { TimeTrackingModule } from './modules/time-tracking/time-tracking.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    OrganizationModule,
    PositionsModule,
    EmployeesModule,
    SchedulingModule,
    TimeTrackingModule,
    NotificationsModule,
  ],
  controllers: [],
  providers: [PrismaService],
  exports: [PrismaService],

})
export class AppModule { }