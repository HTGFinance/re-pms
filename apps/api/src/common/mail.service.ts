import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { config } from '../config';

/** Sends email through the company's SMTP server (SMTP_* in .env). If none is set, nothing is sent and callers show the link instead. */
@Injectable()
export class MailService {
  private log = new Logger('Mail');
  private tx = config.smtp.host ? nodemailer.createTransport({ host: config.smtp.host, port: config.smtp.port, secure: config.smtp.secure, auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined }) : null;
  get enabled() { return !!this.tx; }
  async send(to: string, subject: string, text: string, html: string): Promise<boolean> {
    if (!this.tx || !to) return false;
    try { await this.tx.sendMail({ from: config.smtp.from || config.smtp.user, to, subject, text, html }); return true; }
    catch (e: any) { this.log.warn(`Could not send email to ${to}: ${e.message}`); return false; }
  }
}
