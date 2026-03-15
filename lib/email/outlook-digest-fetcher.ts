/**
 * lib/email/outlook-digest-fetcher.ts
 * Fetches nightly manager report emails from jacob@hwoodgroup.com via Microsoft Graph.
 * Sources: Lightspeed Daily Digest / End of Day, Wynn DAILY SHIFT REPORT.
 */

import { createGraphClient } from '@/lib/microsoft-graph';

const MANAGER_EMAIL = 'jacob@hwoodgroup.com';

export interface ManagerDigestEmail {
  messageId: string;
  subject: string;
  htmlBody: string;
  fromEmail: string;
  receivedAt: string;
  format: 'lightspeed' | 'wynn' | 'unknown';
}

/**
 * Fetch manager digest emails for a given business date.
 * Searches the Archive folder in jacob@hwoodgroup.com mailbox.
 * Uses a 2-day window (businessDate + next day) since emails arrive inconsistently.
 */
export async function fetchManagerDigestEmails(
  businessDate: string
): Promise<ManagerDigestEmail[]> {
  const client = createGraphClient();

  // Build date window: emails for businessDate arrive that night or next morning
  const startDate = `${businessDate}T00:00:00Z`;
  const nextDay = new Date(businessDate + 'T12:00:00Z');
  nextDay.setDate(nextDay.getDate() + 2);
  const endDate = `${nextDay.toISOString().split('T')[0]}T23:59:59Z`;

  const results: ManagerDigestEmail[] = [];

  try {
    // First, find the Archive folder
    const folders = await client
      .api(`/users/${MANAGER_EMAIL}/mailFolders`)
      .select('id,displayName')
      .get();

    const archiveFolder = folders.value?.find(
      (f: any) => f.displayName === 'Archive'
    );

    // Search in Archive if it exists, otherwise search Inbox
    const folderPath = archiveFolder
      ? `/users/${MANAGER_EMAIL}/mailFolders/${archiveFolder.id}/messages`
      : `/users/${MANAGER_EMAIL}/messages`;

    // Fetch Lightspeed emails (Daily Digest + End of Day)
    const lightspeedFilter = `receivedDateTime ge ${startDate} and receivedDateTime le ${endDate} and contains(from/emailAddress/address, 'lightspeed')`;

    const lightspeedMessages = await client
      .api(folderPath)
      .filter(lightspeedFilter)
      .select('id,subject,body,from,receivedDateTime')
      .top(50)
      .orderby('receivedDateTime DESC')
      .get();

    for (const msg of lightspeedMessages.value || []) {
      results.push({
        messageId: msg.id,
        subject: msg.subject || '',
        htmlBody: msg.body?.content || '',
        fromEmail: msg.from?.emailAddress?.address || '',
        receivedAt: msg.receivedDateTime || '',
        format: 'lightspeed',
      });
    }

    // Fetch Wynn / Delilah Vegas emails (DAILY SHIFT REPORT)
    const wynnFilter = `receivedDateTime ge ${startDate} and receivedDateTime le ${endDate} and contains(subject, 'DAILY SHIFT REPORT')`;

    const wynnMessages = await client
      .api(folderPath)
      .filter(wynnFilter)
      .select('id,subject,body,from,receivedDateTime')
      .top(10)
      .orderby('receivedDateTime DESC')
      .get();

    for (const msg of wynnMessages.value || []) {
      results.push({
        messageId: msg.id,
        subject: msg.subject || '',
        htmlBody: msg.body?.content || '',
        fromEmail: msg.from?.emailAddress?.address || '',
        receivedAt: msg.receivedDateTime || '',
        format: 'wynn',
      });
    }

    console.log(
      `[outlook-digest] Found ${results.length} manager digest emails for ${businessDate} (${lightspeedMessages.value?.length || 0} Lightspeed, ${wynnMessages.value?.length || 0} Wynn)`
    );
  } catch (err: any) {
    console.error('[outlook-digest] Failed to fetch emails:', err.message);
  }

  return results;
}
