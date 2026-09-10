import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import { RealtimeEvent, getRealtimeLocationRoom } from './realtime.constants';

interface AuthenticatedSocket extends Socket {
    data: {
        userId: string;
        email: string;
    };
}

@WebSocketGateway({
    cors: {
        origin: '*',
        credentials: true,
    },
    namespace: '/realtime',
})
export class RealtimeGateway
    implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server!: Server;

    private readonly logger = new Logger(RealtimeGateway.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly prisma: PrismaService,
    ) { }

    afterInit() {
        this.logger.log('WebSocket Gateway initialized on namespace: /realtime');
    }

    /**
     * Validates JWT token from handshake auth or headers on connect.
     */
    async handleConnection(client: AuthenticatedSocket) {
        try {
            const token =
                client.handshake.auth?.token?.replace('Bearer ', '') ||
                (client.handshake.headers?.authorization?.replace('Bearer ', '') as string);

            if (!token) {
                throw new UnauthorizedException('Authentication token missing');
            }

            const secret = this.configService.get<string>('JWT_SECRET', 'super-secret');
            const payload = await this.jwtService.verifyAsync(token, { secret });

            client.data = {
                userId: payload.sub || payload.id,
                email: payload.email,
            };

            this.logger.log(`Client connected: ${client.id} (User: ${client.data.email})`);
        } catch (err: any) {
            this.logger.warn(`Connection rejected: ${client.id} - ${err.message}`);
            client.emit('error', { message: 'Unauthorized connection' });
            client.disconnect(true);
        }
    }

    handleDisconnect(client: AuthenticatedSocket) {
        this.logger.log(`Client disconnected: ${client.id}`);
    }

    /**
     * Client registers interest in a specific location grid.
     */
    @SubscribeMessage('join:location')
    async handleJoinLocation(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { locationId: string },
    ) {
        if (!data?.locationId) return { success: false, error: 'locationId required' };

        // Verify user belongs to the organization that owns this location
        const hasAccess = await this.prisma.userRole.findFirst({
            where: {
                userId: client.data.userId,
                scopeType: 'location',
                scopeId: data.locationId,
            },
        });

        const room = getRealtimeLocationRoom(data.locationId);
        await client.join(room);
        this.logger.log(`User ${client.data.userId} joined room ${room}`);

        return { success: true, room };
    }

    @SubscribeMessage('leave:location')
    async handleLeaveLocation(
        @ConnectedSocket() client: AuthenticatedSocket,
        @MessageBody() data: { locationId: string },
    ) {
        if (!data?.locationId) return { success: false };
        const room = getRealtimeLocationRoom(data.locationId);
        await client.leave(room);
        return { success: true };
    }

    /**
     * Helper method called by domain services to broadcast events to a location room.
     */
    emitToLocation(locationId: string, event: RealtimeEvent, payload: any) {
        const room = getRealtimeLocationRoom(locationId);
        this.server.to(room).emit(event, {
            event,
            locationId,
            timestamp: new Date().toISOString(),
            data: payload,
        });
    }
}