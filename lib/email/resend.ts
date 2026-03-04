/**
 * lib/email/resend.ts
 * Resend client singleton for sending transactional emails.
 */

import { Resend } from 'resend';

let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('Missing RESEND_API_KEY environment variable');
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'reports@opsos.app';
