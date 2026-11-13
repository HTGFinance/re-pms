import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { types } from 'pg';
import { config } from '../config';
import { ENTITIES } from './entities';

/** Return PostgreSQL DATE columns as 'YYYY-MM-DD' strings, never JS Dates (avoids time-zone day shifts). */
types.setTypeParser(1082, (v: string) => v);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.username,
  password: config.db.password,
  database: config.db.database,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  entities: ENTITIES,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false, // schema changes only through migrations
  logging: ['error'],
};
export default new DataSource(dataSourceOptions);
