import { Global, Module } from '@nestjs/common';
import { PermissionService } from './services/permission.service';
import { PermissionGuard } from './guards/permission.guard';
import { PrismaService } from '../prisma.service';

/**
 * @Global means any module in the app can inject PermissionService without
 * listing CommonModule in its own `imports` — this is what makes the RBAC
 * fix low-friction to adopt across every existing service.
 */
@Global()
@Module({
  providers: [PermissionService, PermissionGuard, PrismaService],
  exports: [PermissionService, PermissionGuard],
})
export class CommonModule {}
