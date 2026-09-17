import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PermissionService } from '../../common/services/permission.service';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  private async assertOrgAccess(userId: string, orgId: string) {
    const allowed = await this.permissionService.can(userId, 'positions:manage', {
      scopeType: 'organization',
      scopeId: orgId,
    });

    if (!allowed) {
      throw new ForbiddenException('You do not have permission to manage positions in this organization');
    }
  }

  async create(userId: string, dto: CreatePositionDto) {
    await this.assertOrgAccess(userId, dto.orgId);

    const existing = await this.prisma.position.findFirst({
      where: {
        orgId: dto.orgId,
        name: { equals: dto.name.trim(), mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictException(`Position "${dto.name}" already exists in this organization`);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const position = await tx.position.create({
          data: {
            orgId: dto.orgId,
            name: dto.name.trim(),
            hourlyRate: dto.hourlyRate !== undefined ? new Decimal(dto.hourlyRate) : null,
            isLeadership: dto.isLeadership !== undefined ? Boolean(dto.isLeadership) : false,
          },
        });

        await tx.auditLog.create({
          data: {
            orgId: dto.orgId,
            userId,
            action: 'position.create',
            resourceType: 'position',
            resourceId: position.id,
            metadata: {
              name: position.name,
              hourlyRate: position.hourlyRate?.toNumber() ?? null,
              isLeadership: position.isLeadership,
            },
          },
        });

        return position;
      });
    } catch (error: any) {
      this.logger.error(`Error creating position: ${error.message}`, error.stack);
      if (error instanceof ConflictException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create position');
    }
  }

  async findAllByOrg(userId: string, orgId: string) {
    await this.assertOrgAccess(userId, orgId);

    return this.prisma.position.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { employeePositions: true, shifts: true },
        },
      },
    });
  }

  async findOne(userId: string, id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: {
        _count: {
          select: { employeePositions: true, shifts: true },
        },
      },
    });

    if (!position) {
      throw new NotFoundException(`Position with ID ${id} not found`);
    }

    await this.assertOrgAccess(userId, position.orgId);
    return position;
  }

  async update(userId: string, id: string, dto: UpdatePositionDto) {
    const position = await this.findOne(userId, id);

    if (dto.name && dto.name.trim().toLowerCase() !== position.name.toLowerCase()) {
      const duplicate = await this.prisma.position.findFirst({
        where: {
          orgId: position.orgId,
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          NOT: { id },
        },
      });

      if (duplicate) {
        throw new ConflictException(`Position "${dto.name}" already exists in this organization`);
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const updated = await tx.position.update({
          where: { id },
          data: {
            name: dto.name ? dto.name.trim() : undefined,
            hourlyRate:
              dto.hourlyRate !== undefined
                ? new Decimal(dto.hourlyRate)
                : undefined,
            isLeadership:
              dto.isLeadership !== undefined
                ? Boolean(dto.isLeadership)
                : undefined,
          },
        });

        await tx.auditLog.create({
          data: {
            orgId: position.orgId,
            userId,
            action: 'position.update',
            resourceType: 'position',
            resourceId: updated.id,
            metadata: {
              previous: {
                name: position.name,
                hourlyRate: position.hourlyRate?.toNumber() ?? null,
                isLeadership: position.isLeadership,
              },
              updated: {
                name: updated.name,
                hourlyRate: updated.hourlyRate?.toNumber() ?? null,
                isLeadership: updated.isLeadership,
              },
            },
          },
        });

        return updated;
      });
    } catch (error: any) {
      this.logger.error(`Error updating position ${id}: ${error.message}`, error.stack);
      if (
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update position');
    }
  }

  async remove(userId: string, id: string) {
    const position = await this.findOne(userId, id);

    const activeShiftCount = await this.prisma.shift.count({
      where: {
        positionId: id,
        status: { in: ['scheduled', 'published'] },
      },
    });

    if (activeShiftCount > 0) {
      throw new ConflictException(
        `Cannot delete position: ${activeShiftCount} scheduled or published shift(s) are currently assigned to it`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.position.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          orgId: position.orgId,
          userId,
          action: 'position.delete',
          resourceType: 'position',
          resourceId: id,
          metadata: {
            deletedPositionName: position.name,
          },
        },
      });

      return { success: true, message: `Position "${position.name}" deleted successfully` };
    });
  }
}