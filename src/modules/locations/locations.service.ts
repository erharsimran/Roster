import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/locations.dto';

@Injectable()
export class LocationsService {
    constructor(private readonly prisma: PrismaService) { }

    async listByOrg(orgId: string) {
        return this.prisma.location.findMany({
            where: { orgId },
            include: {
                _count: {
                    select: {
                        shifts: true,
                        timeEntries: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async findById(locationId: string) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
            include: {
                _count: {
                    select: {
                        shifts: true,
                        timeEntries: true,
                    },
                },
            },
        });

        if (!location) {
            throw new NotFoundException(`Location with ID ${locationId} not found`);
        }

        return location;
    }

    async create(orgId: string, dto: CreateLocationDto) {
        const existing = await this.prisma.location.findFirst({
            where: {
                orgId,
                name: dto.name.trim(),
            },
        });

        if (existing) {
            throw new ConflictException(
                `Location '${dto.name}' already exists in this organization`,
            );
        }

        return this.prisma.location.create({
            data: {
                orgId,
                name: dto.name.trim(),
                timezone: dto.timezone.trim(),
                address: dto.address?.trim() || null,
                latitude: dto.latitude ?? null,
                longitude: dto.longitude ?? null,
                geofenceRadiusMeters: dto.geofenceRadiusMeters ?? 150,
                operatingHours:
                    (dto.operatingHours as Prisma.InputJsonValue) ?? Prisma.JsonNull,
                requireLeadershipOnDuty: dto.requireLeadershipOnDuty ?? false,
            },
        });
    }

    async update(locationId: string, dto: UpdateLocationDto) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
        });

        if (!location) {
            throw new NotFoundException(`Location with ID ${locationId} not found`);
        }

        if (dto.name && dto.name.trim() !== location.name) {
            const duplicate = await this.prisma.location.findFirst({
                where: {
                    orgId: location.orgId,
                    name: dto.name.trim(),
                    NOT: { id: locationId },
                },
            });

            if (duplicate) {
                throw new ConflictException(
                    `Another location named '${dto.name}' already exists in this organization`,
                );
            }
        }

        const updateData: Prisma.LocationUpdateInput = {};

        if (dto.name !== undefined) updateData.name = dto.name.trim();
        if (dto.timezone !== undefined) updateData.timezone = dto.timezone.trim();
        if (dto.address !== undefined) updateData.address = dto.address?.trim() || null;
        if (dto.latitude !== undefined) updateData.latitude = dto.latitude;
        if (dto.longitude !== undefined) updateData.longitude = dto.longitude;
        if (dto.geofenceRadiusMeters !== undefined) {
            updateData.geofenceRadiusMeters = dto.geofenceRadiusMeters;
        }
        if (dto.operatingHours !== undefined) {
            updateData.operatingHours =
                (dto.operatingHours as Prisma.InputJsonValue) ?? Prisma.JsonNull;
        }
        if (dto.requireLeadershipOnDuty !== undefined) {
            updateData.requireLeadershipOnDuty = dto.requireLeadershipOnDuty;
        }

        return this.prisma.location.update({
            where: { id: locationId },
            data: updateData,
        });
    }

    async remove(locationId: string) {
        const location = await this.prisma.location.findUnique({
            where: { id: locationId },
            include: {
                _count: {
                    select: {
                        shifts: true,
                        timeEntries: true,
                    },
                },
            },
        });

        if (!location) {
            throw new NotFoundException(`Location with ID ${locationId} not found`);
        }

        const shiftsCount = location._count?.shifts ?? 0;
        const timeEntriesCount = location._count?.timeEntries ?? 0;

        if (shiftsCount > 0 || timeEntriesCount > 0) {
            throw new BadRequestException(
                `Cannot delete location '${location.name}': it currently contains ${shiftsCount} shift(s) and ${timeEntriesCount} time punch(es). Reassign or archive them first.`,
            );
        }

        await this.prisma.location.delete({
            where: { id: locationId },
        });

        return {
            success: true,
            message: `Location '${location.name}' deleted successfully`,
        };
    }
}