import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Notification } from '../database/entities';

/** In-app notifications. Phase 6 adds SMS / WhatsApp delivery of the same messages. */
@Injectable()
export class NotifyService {
  constructor(private ds: DataSource) {}
  tenant(tenantId: string, title: string, body: string, link = '', em?: EntityManager) {
    return (em ?? this.ds.manager).save(Notification, { tenantId, title, body, link });
  }
  user(userId: string, title: string, body: string, link = '', em?: EntityManager) {
    return (em ?? this.ds.manager).save(Notification, { userId, title, body, link });
  }
}
