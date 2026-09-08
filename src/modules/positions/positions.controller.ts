import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';

@ApiTags('Positions')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard('jwt'))
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new job position for an organization' })
  @ApiResponse({ status: 201, description: 'Position created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 403, description: 'User does not belong to target organization' })
  @ApiResponse({ status: 409, description: 'Position with this name already exists in org' })
  create(@Req() req: any, @Body() dto: CreatePositionDto) {
    return this.positionsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all positions within an organization' })
  @ApiQuery({ name: 'orgId', type: 'string', required: true })
  @ApiResponse({ status: 200, description: 'List of positions with assignment/shift counts' })
  findAllByOrg(
    @Req() req: any,
    @Query('orgId', new ParseUUIDPipe()) orgId: string,
  ) {
    return this.positionsService.findAllByOrg(req.user.id, orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details for a specific position' })
  @ApiResponse({ status: 200, description: 'Position details' })
  @ApiResponse({ status: 404, description: 'Position not found' })
  findOne(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.positionsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a position name or hourly rate' })
  @ApiResponse({ status: 200, description: 'Position updated successfully' })
  @ApiResponse({ status: 409, description: 'Position name conflicts with existing entry' })
  update(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.positionsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a position (blocked if active shifts exist)' })
  @ApiResponse({ status: 200, description: 'Position deleted successfully' })
  @ApiResponse({ status: 409, description: 'Cannot delete: active shifts depend on it' })
  remove(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.positionsService.remove(req.user.id, id);
  }
}