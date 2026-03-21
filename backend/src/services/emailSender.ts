import nodemailer from 'nodemailer';

type Attachment = { filename: string; path: string; cid?: string };

const mockTransporter = {
    sendMail: async (mailOptions: any) => {
        const to = mailOptions.to || mailOptions.bcc || '(no-recipient)';
        console.log(`[EMAIL SIM] TO: ${to} | SUBJECT: ${mailOptions.subject}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { messageId: 'simulated_send' };
    }
};

let transporter: any = mockTransporter;

const smtpHost = process.env.SMTP_HOST;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpSecure = smtpPort === 465;

if (smtpHost && smtpUser && smtpPass) {
    transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        requireTLS: !smtpSecure,
        auth: {
            user: smtpUser,
            pass: smtpPass
        },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000
    });
    console.log(`[EMAIL] SMTP initialized for host=${smtpHost}:${smtpPort}`);
} else {
    console.log('[EMAIL] No complete SMTP config found. Running in simulation mode.');
}

const FROM = process.env.SMTP_FROM || '"Leader A1 Fleet System" <noreply@leadera1.com>';

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
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] ${days}-day reminder sent to ${to} (ID: ${info.messageId})`);
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
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Disconnection alert sent to ${to} (ID: ${info.messageId})`);
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
): Promise<boolean> => {
    if (to.length === 0) return false;

    try {
        const mailOptions = {
            from: FROM,
            bcc: to,
            subject,
            html: htmlContent,
            attachments
        };
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Broadcast sent to ${to.length} recipients (ID: ${info.messageId})`);
        return true;
    } catch (e) {
        console.error('[EMAIL] Failed to send broadcast:', e);
        return false;
    }
};
