import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiParam,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/locations.dto';

@ApiTags('Store Locations')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller()
export class LocationsController {
    constructor(private readonly locationsService: LocationsService) { }

    @Get('organizations/:orgId/locations')
    @ApiOperation({ summary: 'List all store locations for an organization' })
    @ApiParam({ name: 'orgId', type: 'string', description: 'Organization UUID' })
    @ApiResponse({ status: 200, description: 'List of locations with punch and shift counts' })
    listByOrg(@Param('orgId', new ParseUUIDPipe()) orgId: string) {
        return this.locationsService.listByOrg(orgId);
    }

    @Post('organizations/:orgId/locations')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new branch location for an organization' })
    @ApiParam({ name: 'orgId', type: 'string', description: 'Organization UUID' })
    @ApiResponse({ status: 201, description: 'Location created successfully' })
    @ApiResponse({ status: 409, description: 'Location name already exists in organization' })
    create(
        @Param('orgId', new ParseUUIDPipe()) orgId: string,
        @Body() dto: CreateLocationDto,
    ) {
        return this.locationsService.create(orgId, dto);
    }

    @Get('locations/:locationId')
    @ApiOperation({ summary: 'Get details for a specific location' })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    @ApiResponse({ status: 200, description: 'Location details' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    findById(@Param('locationId', new ParseUUIDPipe()) locationId: string) {
        return this.locationsService.findById(locationId);
    }

    @Patch('locations/:locationId')
    @ApiOperation({ summary: 'Update branch settings, operating hours, or geofencing' })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    @ApiResponse({ status: 200, description: 'Location updated successfully' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    update(
        @Param('locationId', new ParseUUIDPipe()) locationId: string,
        @Body() dto: UpdateLocationDto,
    ) {
        return this.locationsService.update(locationId, dto);
    }

    @Delete('locations/:locationId')
    @ApiOperation({ summary: 'Delete an unused location' })
    @ApiParam({ name: 'locationId', type: 'string', description: 'Location UUID' })
    @ApiResponse({ status: 200, description: 'Location deleted successfully' })
    @ApiResponse({ status: 400, description: 'Location has active shifts or punches' })
    @ApiResponse({ status: 404, description: 'Location not found' })
    remove(@Param('locationId', new ParseUUIDPipe()) locationId: string) {
        return this.locationsService.remove(locationId);
    }
}