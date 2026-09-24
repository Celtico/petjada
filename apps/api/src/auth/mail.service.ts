import { Inject, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../config';

export interface MagicLinkMail {
  to: string;
  link: string;
  code: string;
  expiresMin: number;
}

/**
 * Enviament del correu d'entrada. Si no hi ha SMTP configurat (`SMTP_HOST`
 * buit), l'enllaç i el codi s'escriuen al log del servidor (mode dev).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: nodemailer.Transporter | null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.transport = config.smtpHost
      ? nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpSecure,
          auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
          tls: config.smtpTlsServername ? { servername: config.smtpTlsServername } : undefined,
        })
      : null;
    if (this.transport) {
      this.logger.log(`SMTP configurat: ${config.smtpHost}:${config.smtpPort} (secure=${config.smtpSecure})`);
      void this.transport
        .verify()
        .then(() => this.logger.log('Connexió SMTP verificada'))
        .catch((error: unknown) =>
          this.logger.error(`No s'ha pogut connectar al servidor SMTP: ${error instanceof Error ? error.message : String(error)}`),
        );
    }
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async sendMagicLink(mail: MagicLinkMail): Promise<void> {
    if (!this.transport) {
      this.logger.warn(
        `[DEV] Enllaç d'entrada per a ${mail.to}:\n  enllaç: ${mail.link}\n  codi:   ${mail.code}\n  (caduca en ${mail.expiresMin} min)`,
      );
      return;
    }
    const text = [
      'Hola!',
      '',
      `Per entrar a Petjada, obre aquest enllaç (caduca en ${mail.expiresMin} minuts):`,
      mail.link,
      '',
      `O bé escriu aquest codi a l'app: ${mail.code}`,
      '',
      "Si no has demanat entrar, ignora aquest correu.",
    ].join('\n');
    const html = `
      <p>Hola!</p>
      <p>Per entrar a <strong>Petjada</strong>, obre aquest enllaç (caduca en ${mail.expiresMin} minuts):</p>
      <p><a href="${mail.link}">${mail.link}</a></p>
      <p>O bé escriu aquest codi a l'app:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:bold">${mail.code}</p>
      <p>Si no has demanat entrar, ignora aquest correu.</p>`;
    await this.transport.sendMail({
      from: this.config.smtpFrom,
      to: mail.to,
      subject: `El teu codi de Petjada: ${mail.code}`,
      text,
      html,
    });
  }
}
