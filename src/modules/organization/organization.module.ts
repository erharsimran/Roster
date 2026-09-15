import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationRolesController } from './organization-roles.controller';

import { OrganizationService } from './organization.service';
import { OrganizationRolesService } from './organization-roles.service';
import { PrismaService } from '../../prisma.service';


@Module({
  controllers: [OrganizationController, OrganizationRolesController],
  providers: [OrganizationService, OrganizationRolesService, PrismaService],
  exports: [OrganizationService, OrganizationRolesService],
})
export class OrganizationModule {}