import { Body, Controller, Get, HttpCode, Post, Res, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../../database/entities';
import { AuthUser, CurrentUser, Public } from '../../common/auth';
import { config } from '../../config';

class LoginDto { @IsEmail() email: string; @IsString() password: string }
class ChangePasswordDto { @IsString() currentPassword: string; @IsString() @MinLength(10) newPassword: string }

@Controller('auth')
export class AuthController {
  constructor(@InjectRepository(User) private users: Repository<User>, private jwt: JwtService) {}

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const u = await this.users.findOne({ where: { email: dto.email.toLowerCase().trim() }, relations: { buildings: true }, select: { id: true, email: true, name: true, role: true, tenantId: true, isActive: true, passwordHash: true, mustChangePassword: true, buildings: { id: true } } });
    if (!u || !u.isActive || !(await bcrypt.compare(dto.password, u.passwordHash))) throw new UnauthorizedException('Wrong email or password');
    const payload: AuthUser = { id: u.id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId, buildingIds: (u.buildings || []).map((b) => b.id), mustChangePassword: u.mustChangePassword };
    const token = await this.jwt.signAsync(payload);
    await this.users.update(u.id, { lastLoginAt: new Date() });
    res.cookie('repms_token', token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 12 * 3600 * 1000, path: '/' });
    return { token, user: payload };
  }

  @Public() @Post('logout') @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) { res.clearCookie('repms_token', { path: '/' }); return { ok: true }; }

  @Get('me') me(@CurrentUser() u: AuthUser) { return u; }

  /** Change password; also clears the 'must change' flag and issues a fresh session. */
  @Post('change-password') @HttpCode(200)
  async changePassword(@CurrentUser() me: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    const u = await this.users.findOne({ where: { id: me.id }, select: { id: true, passwordHash: true } });
    if (!u || !(await bcrypt.compare(dto.currentPassword, u.passwordHash))) throw new BadRequestException('Current password is wrong');
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('Choose a password different from the current one');
    await this.users.update(u.id, { passwordHash: await bcrypt.hash(dto.newPassword, 10), mustChangePassword: false });
    const payload: AuthUser = { ...me, mustChangePassword: false }; delete (payload as any).iat; delete (payload as any).exp;
    const token = await this.jwt.signAsync(payload);
    res.cookie('repms_token', token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 12 * 3600 * 1000, path: '/' });
    return { ok: true, token };
  }
}
