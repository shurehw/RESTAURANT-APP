/**
 * Microsoft Graph API Client
 * Connects to Outlook to read emails from ap@hwoodgroup.com
 */

import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';

const apEmail = process.env.AP_EMAIL || 'ap@hwoodgroup.com';

function getCredentials() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  if (!clientId || !clientSecret || !tenantId) {
    throw new Error('Missing Microsoft Graph credentials. Please set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, and MICROSOFT_TENANT_ID');
  }
  return { clientId, clientSecret, tenantId };
}

/**
 * Create authenticated Microsoft Graph client
 */
export function createGraphClient() {
  const { clientId, clientSecret, tenantId } = getCredentials();
  const credential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret
  );

  const authProvider = {
    getAccessToken: async () => {
      const token = await credential.getToken('https://graph.microsoft.com/.default');
      return token?.token || '';
    },
  };

  return Client.initWithMiddleware({
    authProvider,
  });
}

/**
 * Get unread emails from ap@hwoodgroup.com inbox
 */
export async function getAPInboxEmails(limit: number = 10) {
  const client = createGraphClient();

  try {
    const messages = await client
      .api(`/users/${apEmail}/messages`)
      .filter('isRead eq false')
      .select('id,subject,from,receivedDateTime,hasAttachments,body')
      .top(limit)
      .orderby('receivedDateTime DESC')
      .get();

    return messages.value || [];
  } catch (error: any) {
    console.error('Error fetching emails from Microsoft Graph:', error);
    throw new Error(`Failed to fetch emails: ${error.message}`);
  }
}

/**
 * Get email attachments
 */
export async function getEmailAttachments(messageId: string) {
  const client = createGraphClient();

  try {
    const attachments = await client
      .api(`/users/${apEmail}/messages/${messageId}/attachments`)
      .get();

    return attachments.value || [];
  } catch (error: any) {
    console.error('Error fetching attachments:', error);
    throw new Error(`Failed to fetch attachments: ${error.message}`);
  }
}

/**
 * Download attachment content
 */
export async function downloadAttachment(messageId: string, attachmentId: string) {
  const client = createGraphClient();

  try {
    const attachment = await client
      .api(`/users/${apEmail}/messages/${messageId}/attachments/${attachmentId}`)
      .get();

    // Microsoft Graph returns base64 content for file attachments
    if (attachment.contentBytes) {
      return Buffer.from(attachment.contentBytes, 'base64');
    }

    throw new Error('No content found in attachment');
  } catch (error: any) {
    console.error('Error downloading attachment:', error);
    throw new Error(`Failed to download attachment: ${error.message}`);
  }
}

/**
 * Mark email as read
 */
export async function markEmailAsRead(messageId: string) {
  const client = createGraphClient();

  try {
    await client
      .api(`/users/${apEmail}/messages/${messageId}`)
      .update({
        isRead: true,
      });
  } catch (error: any) {
    console.error('Error marking email as read:', error);
    throw new Error(`Failed to mark email as read: ${error.message}`);
  }
}

/**
 * Search for invoice emails (with attachments, from vendors)
 */
export async function searchInvoiceEmails(limit: number = 20) {
  const client = createGraphClient();

  try {
    // Search for emails with attachments that likely contain invoices
    const messages = await client
      .api(`/users/${apEmail}/messages`)
      .filter('hasAttachments eq true and isRead eq false')
      .select('id,subject,from,receivedDateTime,hasAttachments')
      .top(limit)
      .orderby('receivedDateTime DESC')
      .get();

    // Filter for likely invoice emails based on subject
    const invoiceKeywords = ['invoice', 'bill', 'statement', 'payment due', 'account'];

    const invoiceEmails = messages.value.filter((msg: any) => {
      const subject = msg.subject?.toLowerCase() || '';
      return invoiceKeywords.some(keyword => subject.includes(keyword));
    });

    return invoiceEmails;
  } catch (error: any) {
    console.error('Error searching invoice emails:', error);
    throw new Error(`Failed to search emails: ${error.message}`);
  }
}
