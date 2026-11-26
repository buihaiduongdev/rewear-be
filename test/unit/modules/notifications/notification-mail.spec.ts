import { randomUUID } from 'node:crypto';

import type { ConfigService } from '@/modules/config';
import { MailService } from '@/modules/mail/mail.service';

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: mockSendMail }) },
}));
describe('Notification email transport', () => {
  const mail = new MailService({
    mail: {
      host: 'smtp.test',
      port: 587,
      secure: false,
      user: 'test',
      password: 'test',
      from: 'rewear@test.local',
      frontendUrl: 'https://rewear.test',
    },
  } as unknown as ConfigService);
  beforeEach(() => mockSendMail.mockReset());
  it('uses text and an authenticated generic destination with stable message id', async () => {
    mockSendMail.mockResolvedValue({
      accepted: ['buyer@test.local'],
      rejected: [],
    });
    const job = randomUUID();
    await mail.sendNotificationEmail(
      'buyer@test.local',
      { title: 'New order', body: 'Open Rewear to view.' },
      job,
    );
    const message = mockSendMail.mock.calls[0][0];
    expect(message.subject).toBe('New order - RE.WEAR');
    expect(message.messageId).toContain(job);
    expect(message.text).toContain(
      'Sign in to Rewear to view details: https://rewear.test/notifications',
    );
    expect(message).not.toHaveProperty('html');
  });
  it('does not mark rejected email as delivered', async () => {
    mockSendMail.mockResolvedValue({
      accepted: [],
      rejected: ['buyer@test.local'],
    });
    await expect(
      mail.sendNotificationEmail(
        'buyer@test.local',
        { title: 'Shop invitation', body: 'Open Rewear.' },
        randomUUID(),
      ),
    ).rejects.toThrow('Notification email not accepted');
  });
});
