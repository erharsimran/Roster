import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../prisma.service';

@Module({
    controllers: [EmployeesController],
    providers: [EmployeesService, PrismaService],
    exports: [EmployeesService],
})
export class EmployeesModule { }