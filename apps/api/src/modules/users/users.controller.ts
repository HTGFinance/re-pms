import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { In, Repository } from 'typeorm';
import { Building, Role, User } from '../../database/entities';
import { Roles } from '../../common/auth';

class CreateUserDto {
  @IsEmail() email: string; @IsString() name: string; @IsEnum(Role) role: Role;
  @IsString() @MinLength(10) password: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) buildingIds?: string[];
  @IsOptional() @IsUUID() tenantId?: string;
}
class UpdateUserDto {
  @IsOptional() @IsString() name?: string; @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) buildingIds?: string[];
  @IsOptional() @IsString() @MinLength(10) password?: string;
}

@Controller('users') @Roles(Role.ADMIN)
export class UsersController {
  constructor(@InjectRepository(User) private users: Repository<User>, @InjectRepository(Building) private buildings: Repository<Building>) {}

  @Get() list() { return this.users.find({ relations: { buildings: true }, order: { name: 'ASC' } }); }

  @Post() async create(@Body() d: CreateUserDto) {
    const email = d.email.toLowerCase().trim();
    if (await this.users.exists({ where: { email } })) throw new ConflictException('A user with this email already exists');
    if (d.role === Role.TENANT && !d.tenantId) throw new ConflictException('Tenant logins need a tenantId');
    const u = this.users.create({ email, name: d.name, role: d.role, tenantId: d.tenantId ?? null, passwordHash: await bcrypt.hash(d.password, 10),
      buildings: d.buildingIds?.length ? await this.buildings.findBy({ id: In(d.buildingIds) }) : [] });
    const saved = await this.users.save(u); const { passwordHash, ...rest } = saved as any; return rest;
  }

  @Patch(':id') async update(@Param('id', ParseUUIDPipe) id: string, @Body() d: UpdateUserDto) {
    const u = await this.users.findOne({ where: { id }, relations: { buildings: true } });
    if (!u) throw new NotFoundException();
    if (d.name !== undefined) u.name = d.name; if (d.role) u.role = d.role; if (d.isActive !== undefined) u.isActive = d.isActive;
    if (d.buildingIds) u.buildings = d.buildingIds.length ? await this.buildings.findBy({ id: In(d.buildingIds) }) : [];
    if (d.password) (u as any).passwordHash = await bcrypt.hash(d.password, 10);
    const saved = await this.users.save(u); const { passwordHash, ...rest } = saved as any; return rest;
  }
}
