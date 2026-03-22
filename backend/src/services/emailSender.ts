import nodemailer from 'nodemailer';

type Attachment = { filename: string; path: string; cid?: string };
type SendResult = { ok: boolean; error?: string };

const mockTransporter = {
    sendMail: async (mailOptions: any) => {
        const to = mailOptions.to || mailOptions.bcc || '(no-recipient)';
        console.log(`[EMAIL SIM] TO: ${to} | SUBJECT: ${mailOptions.subject}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { messageId: 'simulated_send' };
    }
};

let transporters: any[] = [mockTransporter];

const smtpHost = process.env.SMTP_HOST;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpFallbackPort = Number(process.env.SMTP_FALLBACK_PORT) || (smtpPort === 587 ? 465 : 587);

const buildTransporter = (port: number) => {
    const secure = port === 465;
    return nodemailer.createTransport({
        host: smtpHost,
        port,
        secure,
        requireTLS: !secure,
        auth: {
            user: smtpUser,
            pass: smtpPass
        },
        connectionTimeout: 12000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
        tls: { minVersion: 'TLSv1.2' }
    });
};

if (smtpHost && smtpUser && smtpPass) {
    const primary = buildTransporter(smtpPort);
    transporters = [primary];
    console.log(`[EMAIL] SMTP initialized for host=${smtpHost}:${smtpPort}`);

    if (smtpFallbackPort !== smtpPort) {
        transporters.push(buildTransporter(smtpFallbackPort));
        console.log(`[EMAIL] SMTP fallback configured for host=${smtpHost}:${smtpFallbackPort}`);
    }
} else {
    console.log('[EMAIL] No complete SMTP config found. Running in simulation mode.');
}

const FROM = process.env.SMTP_FROM || '"Leader A1 Fleet System" <noreply@leadera1.com>';
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const RESEND_FROM = String(process.env.RESEND_FROM || process.env.SMTP_FROM || '').trim();

const sendViaFallback = async (mailOptions: any): Promise<SendResult> => {
    let lastError = '';
    for (let i = 0; i < transporters.length; i += 1) {
        try {
            const info = await transporters[i].sendMail(mailOptions);
            return { ok: true, error: info?.messageId };
        } catch (e: any) {
            const message = e?.message || String(e);
            const code = e?.code ? ` (${e.code})` : '';
            lastError = `${message}${code}`;
            console.error(`[EMAIL] Transport attempt ${i + 1} failed:`, e);
        }
    }
    return { ok: false, error: lastError || 'Unknown email error' };
};

const sendViaResend = async (
    to: string[],
    subject: string,
    html: string,
    attachments: Attachment[] = []
): Promise<SendResult> => {
    if (!RESEND_API_KEY || !RESEND_FROM) {
        return { ok: false, error: 'Resend fallback is not configured (RESEND_API_KEY/RESEND_FROM missing).' };
    }
    try {
        const payload: any = {
            from: RESEND_FROM,
            to,
            subject,
            html
        };

        // Resend expects base64 "content" for attachments.
        if (attachments.length > 0) {
            const mapped = [];
            for (const file of attachments) {
                try {
                    const fs = await import('fs');
                    const b64 = fs.readFileSync(file.path).toString('base64');
                    mapped.push({
                        filename: file.filename,
                        content: b64
                    });
                } catch (e: any) {
                    console.warn(`[EMAIL] Failed to read attachment for Resend (${file.path}):`, e?.message || e);
                }
            }
            if (mapped.length > 0) payload.attachments = mapped;
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { ok: false, error: `Resend HTTP ${response.status}: ${text}` };
        }

        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'Resend fallback failed.' };
    }
};

export const sendReminderEmail = async (to: string, driverName: string, days: number): Promise<boolean> => {
    try {
        const mailOptions = {
            from: FROM,
            to,
            subject: `Action Required: ELD Profile Form ${days}+ Days Overdue`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                    <h2 style="color: #e11d48;">Profile Form Update Required</h2>
                    <p>Hi <strong>${driverName}</strong>,</p>
                    <p>Your ELD profile form has <strong>not been updated in over ${days} days</strong>.</p>
                    <p>Please log into the ELD system immediately to update your profile form and maintain compliance.</p>
                    <br/>
                    <p style="color: #64748b; font-size: 0.875rem;">This is an automated message from the Leader A1 Fleet Monitoring System.</p>
                </div>
            `
        };
        let result = await sendViaFallback(mailOptions);
        if (!result.ok) {
            result = await sendViaResend([to], mailOptions.subject, mailOptions.html);
        }
        if (!result.ok) throw new Error(result.error);
        console.log(`[EMAIL] ${days}-day reminder sent to ${to}`);
        return true;
    } catch (e) {
        console.error(`[EMAIL] Failed to send to ${to}:`, e);
        return false;
    }
};

export const sendDisconnectionEmail = async (to: string, driverName: string): Promise<boolean> => {
    try {
        const mailOptions = {
            from: FROM,
            to,
            subject: `ELD Disconnection Alert: ${driverName}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
                    <h2 style="color: #dc2626;">ELD Device Disconnected</h2>
                    <p>Hi <strong>${driverName}</strong>,</p>
                    <p>Your ELD device has been detected as <strong>DISCONNECTED</strong> from the Leader ELD network.</p>
                    <p>Please ensure your device is properly connected to avoid compliance issues.</p>
                    <br/>
                    <p style="color: #64748b; font-size: 0.875rem;">This is an automated alert from the Leader A1 Fleet Monitoring System.</p>
                </div>
            `
        };
        let result = await sendViaFallback(mailOptions);
        if (!result.ok) {
            result = await sendViaResend([to], mailOptions.subject, mailOptions.html);
        }
        if (!result.ok) throw new Error(result.error);
        console.log(`[EMAIL] Disconnection alert sent to ${to}`);
        return true;
    } catch (e) {
        console.error(`[EMAIL] Failed to send disconnection alert to ${to}:`, e);
        return false;
    }
};

export const sendCustomBroadcastEmail = async (
    to: string[],
    subject: string,
    htmlContent: string,
    attachments: Attachment[] = []
): Promise<SendResult> => {
    if (to.length === 0) return { ok: false, error: 'No recipients provided.' };

    try {
        const singleRecipient = to.length === 1;
        const mailOptions = {
            from: FROM,
            to: singleRecipient ? to[0] : undefined,
            bcc: singleRecipient ? undefined : to,
            subject,
            html: htmlContent,
            attachments
        };
        let result = await sendViaFallback(mailOptions);
        if (!result.ok) {
            const resendResult = await sendViaResend(to, subject, htmlContent, attachments);
            result = resendResult.ok ? resendResult : { ok: false, error: `${result.error || 'SMTP send failed.'} | ${resendResult.error || 'Resend failed.'}` };
        }
        if (!result.ok) {
            return { ok: false, error: result.error };
        }
        console.log(`[EMAIL] Broadcast sent to ${to.length} recipients`);
        return { ok: true };
    } catch (e) {
        console.error('[EMAIL] Failed to send broadcast:', e);
        return { ok: false, error: e instanceof Error ? e.message : 'Unknown broadcast error' };
    }
};
