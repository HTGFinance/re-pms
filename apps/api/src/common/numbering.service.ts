import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/** Issues sequential document numbers (T-0001, CTR-0001 …) safely under concurrency. */
@Injectable()
export class NumberingService {
  async next(em: EntityManager, key: string, prefix: string, width = 4): Promise<string> {
    const rows = await em.query(
      `INSERT INTO counters(key, value) VALUES ($1, 1)
       ON CONFLICT (key) DO UPDATE SET value = counters.value + 1 RETURNING value`, [key]);
    return prefix + String(rows[0].value).padStart(width, '0');
  }
}
