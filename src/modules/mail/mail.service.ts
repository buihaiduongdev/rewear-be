import { Injectable } from '@nestjs/common';

import nodemailer, { Transporter } from 'nodemailer';

import { ConfigService } from '@/modules/config';

import { getResetPasswordTemplate, getVerifyEmailTemplate } from './templates';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.mail;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const url = new URL('/verify-email', this.configService.mail.frontendUrl);
    url.searchParams.set('token', token);
    await this.transporter.sendMail({
      from: this.configService.mail.from,
      to: email,
      subject: 'Verify your email address - RE.WEAR',
      html: getVerifyEmailTemplate(url.toString()),
    });
  }

  async sendResetPasswordEmail(email: string, token: string): Promise<void> {
    const url = new URL('/reset-password', this.configService.mail.frontendUrl);
    url.searchParams.set('token', token);
    await this.transporter.sendMail({
      from: this.configService.mail.from,
      to: email,
      subject: 'Reset your password - RE.WEAR',
      html: getResetPasswordTemplate(url.toString()),
    });
  }
}
