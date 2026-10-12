export const getResetPasswordTemplate = (resetUrl: string): string => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
    <h2 style="margin-top: 0; color: #111827; font-size: 20px; font-weight: 600;">Reset Your Password</h2>
    <p style="color: #4b5563; font-size: 15px; line-height: 1.5;">We received a request to reset your RE.WEAR password. Use the button below to set a new password:</p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="${resetUrl}" style="background-color: #111827; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px; display: inline-block;">Reset Password</a>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.5;">This link expires in 15 minutes. If you did not request a password reset, you can ignore this email.</p>
    <hr style="border: none; border-top: 1px solid #f3f4f6; margin: 24px 0;" />
    <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; word-break: break-all;">Or copy and paste this URL into your browser:<br /><a href="${resetUrl}" style="color: #4b5563;">${resetUrl}</a></p>
  </div>
</body>
</html>
`;
