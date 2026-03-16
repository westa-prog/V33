
/**
 * Service to handle sending emails via the Gmail API
 */
export const sendGmailMessage = async (
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  attachments?: { name: string; type: string; base64: string }[]
): Promise<{ ok: boolean; error?: string }> => {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const boundary = `====_Boundary_${Date.now()}_====`;

  let messageParts: string[] = [];

  if (attachments && attachments.length > 0) {
    messageParts = [
      `To: ${to}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
      ''
    ];

    attachments.forEach(file => {
      messageParts.push(
        `--${boundary}`,
        `Content-Type: ${file.type}; name="${file.name}"`,
        `Content-Disposition: attachment; filename="${file.name}"`,
        'Content-Transfer-Encoding: base64',
        '',
        file.base64,
        ''
      );
    });

    messageParts.push(`--${boundary}--`);
  } else {
    messageParts = [
      `To: ${to}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];
  }

  const message = messageParts.join('\n');

  // The message needs to be base64url encoded
  const encodedEmail = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedEmail,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, error: text || `HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (error: any) {
    console.error('Gmail API Error:', error);
    return { ok: false, error: error?.message || 'Network error' };
  }
};

/**
 * Service to handle broadcasting emails via the Gmail API using BCC
 */
export const sendGmailBroadcast = async (
  accessToken: string,
  bccRecipients: string[],
  subject: string,
  body: string,
  attachments?: { name: string; type: string; base64: string }[]
): Promise<{ ok: boolean; error?: string }> => {
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
  const boundary = `====_Boundary_${Date.now()}_====`;

  let messageParts: string[] = [];
  const bccHeader = `Bcc: ${bccRecipients.join(', ')}`;

  if (attachments && attachments.length > 0) {
    messageParts = [
      bccHeader,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body,
      ''
    ];

    attachments.forEach(file => {
      messageParts.push(
        `--${boundary}`,
        `Content-Type: ${file.type}; name="${file.name}"`,
        `Content-Disposition: attachment; filename="${file.name}"`,
        'Content-Transfer-Encoding: base64',
        '',
        file.base64,
        ''
      );
    });

    messageParts.push(`--${boundary}--`);
  } else {
    messageParts = [
      bccHeader,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body,
    ];
  }

  const message = messageParts.join('\n');

  // The message needs to be base64url encoded
  const encodedEmail = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedEmail,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, error: text || `HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (error: any) {
    console.error('Gmail API Broadcast Error:', error);
    return { ok: false, error: error?.message || 'Network error' };
  }
};

/**
 * Fetches recent messages from the user's Gmail inbox and maps them to DriverReply objects.
 */
export const fetchGmailReplies = async (
  accessToken: string,
  driverEmails: string[]
): Promise<any[]> => {
  try {
    // 1. List recent messages in the inbox
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:inbox&maxResults=20',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }
    );

    if (!listRes.ok) return [];
    const listData = await listRes.json();
    const messages = listData.messages || [];

    const replies: any[] = [];

    // 2. Fetch details for each message
    for (const msg of messages) {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (!detailRes.ok) continue;
      const detail = await detailRes.json();

      // Extract headers
      const headers = detail.payload?.headers || [];
      const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
      const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';

      // Parse email from "Name <email@example.com>" or just "email@example.com"
      const emailMatch = fromHeader.match(/<(.+?)>/) || [null, fromHeader];
      const senderEmail = emailMatch[1].trim().toLowerCase();

      // Check if this sender is one of our drivers
      if (driverEmails.map(e => e.toLowerCase()).includes(senderEmail)) {
        replies.push({
          id: detail.id,
          driverId: senderEmail, // We use email as ID for mapping usually
          driverName: fromHeader.split('<')[0].trim() || senderEmail,
          timestamp: new Date(dateHeader).toISOString(),
          message: detail.snippet || '',
          isRead: !detail.labelIds.includes('UNREAD'),
          sentiment: undefined // Could be added with Gemini later
        });
      }
    }

    return replies;
  } catch (error) {
    console.error('Fetch Gmail Replies Error:', error);
    return [];
  }
};
