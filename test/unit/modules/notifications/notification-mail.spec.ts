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
  it('labels simulation, uses text and an authenticated generic destination with stable message id', async () => {
    mockSendMail.mockResolvedValue({
      accepted: ['buyer@test.local'],
      rejected: [],
    });
    const job = randomUUID();
    await mail.sendNotificationEmail(
      'buyer@test.local',
      { title: 'Đơn hàng mới', body: 'Mở Rewear để xem.', mode: 'SIMULATION' },
      job,
    );
    const message = mockSendMail.mock.calls[0][0];
    expect(message.subject).toContain('[MÔ PHỎNG]');
    expect(message.messageId).toContain(job);
    expect(message.text).toContain('https://rewear.test/notifications');
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
        { title: 'Lời mời', body: 'Mở Rewear.', mode: null },
        randomUUID(),
      ),
    ).rejects.toThrow('Notification email not accepted');
  });
});
