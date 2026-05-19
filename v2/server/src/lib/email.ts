import nodemailer from 'nodemailer';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let transporter: nodemailer.Transporter | null = null;

export function isEmailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured');
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || 'AquaSim <noreply@aquasim.local>',
    to,
    subject: 'AquaSim - Password Reset',
    html: `
      <h2>Password Reset</h2>
      <p>You requested a password reset for your AquaSim account.</p>
      <p><a href="${esc(resetUrl)}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>
    `,
  });
}

export async function sendWelcomeEmail(
  to: string,
  username: string,
): Promise<void> {
  if (!isEmailConfigured()) return;

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || 'AquaSim <noreply@aquasim.local>',
    to,
    subject: 'Welcome to AquaSim',
    html: `
      <h2>Welcome to AquaSim, ${esc(username)}!</h2>
      <p>Your account has been created. Dive in and start building your marine ecosystem.</p>
    `,
  });
}
