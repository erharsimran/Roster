import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway';
import { PrismaService } from '../../prisma.service';

@Global() // Makes RealtimeGateway available to Scheduling, TimeTracking, etc. without repetitive imports
@Module({
    imports: [
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('JWT_SECRET', 'super-secret'),
            }),
        }),
    ],
    providers: [RealtimeGateway, PrismaService],
    exports: [RealtimeGateway],
})
export class RealtimeModule { }