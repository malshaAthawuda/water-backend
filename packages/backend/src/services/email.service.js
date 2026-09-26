const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Create SMTP transporter from environment configuration.
 * Supports standard SMTP (Gmail, Brevo, SendGrid, etc.)
 */
function createTransporter() {
    const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
    const user = process.env.SMTP_USER || process.env.EMAIL_USER;
    const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    const port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT, 10) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;

    // Check if valid credentials are provided
    if (!host || !user || !pass) {
        return null;
    }

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
            user,
            pass,
        },
        tls: {
            rejectUnauthorized: false,
        },
    });
}

/**
 * Send 6-digit OTP email to user for tracking reports by NIC
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.otp - 6-digit verification code
 * @param {string} options.nic - Citizen NIC
 * @returns {Promise<{ sent: boolean, error?: string }>}
 */
async function sendTrackingOtpEmail({ to, otp, nic }) {
    const transporter = createTransporter();

    const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER || '"Water Quality Portal" <notifications@water-quality.org>';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; }
        .container { max-width: 580px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
        .header { background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: #ffffff; padding: 30px 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
        .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
        .content { padding: 32px 28px; color: #333333; line-height: 1.6; }
        .otp-container { text-align: center; margin: 28px 0; }
        .otp-box { display: inline-block; font-family: 'Consolas', 'Courier New', monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0D47A1; background: #e3f2fd; padding: 14px 32px; border-radius: 10px; border: 2px dashed #90caf9; }
        .badge { display: inline-block; padding: 4px 10px; background-color: #f1f8e9; color: #2e7d32; border-radius: 6px; font-size: 13px; font-weight: 600; }
        .footer { background-color: #fafbfc; border-top: 1px solid #eef0f3; padding: 20px; text-align: center; font-size: 12px; color: #78909c; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🌊 Water Quality Monitoring Portal</h1>
          <p>Citizen Report Tracking Verification</p>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>You recently requested to track public water quality reports submitted under NIC: <span class="badge">${nic}</span>.</p>
          <p>Please enter the following 6-digit verification code to view your report statuses:</p>
          
          <div class="otp-container">
            <div class="otp-box">${otp}</div>
          </div>
          
          <p style="font-size: 13px; color: #e65100; text-align: center;">
            ⏱️ <strong>This code is valid for 10 minutes.</strong>
          </p>
          <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 24px 0;" />
          <p style="font-size: 12px; color: #757575;">
            If you did not request this verification code, please ignore this email. No changes will be made to your submissions.
          </p>
        </div>
        <div class="footer">
          Water Quality Monitoring System &bull; Secure Citizen Services &bull; Automated Notification
        </div>
      </div>
    </body>
    </html>
    `;

    const textContent = `Water Quality Monitoring Portal\n\nYour 6-digit verification code to track reports for NIC ${nic} is: ${otp}\n\nThis code expires in 10 minutes. If you did not request this, please disregard this email.`;

    if (!transporter) {
        logger.warn(`[EMAIL SERVICE] No SMTP credentials configured. Verification code for ${to} (${nic}): ${otp}`);
        return { sent: false, error: 'SMTP credentials not configured in environment', otp };
    }

    try {
        const info = await transporter.sendMail({
            from: fromAddress,
            to,
            subject: `[Water Quality Portal] Your Verification Code: ${otp}`,
            text: textContent,
            html: htmlContent,
        });

        logger.info(`[EMAIL SERVICE] Successfully sent OTP email to ${to} (Message ID: ${info.messageId})`);
        return { sent: true, messageId: info.messageId };
    } catch (err) {
        logger.error(`[EMAIL SERVICE] Failed to send email to ${to}: ${err.message}`);
        return { sent: false, error: err.message, otp };
    }
}

module.exports = {
    sendTrackingOtpEmail,
    createTransporter,
};
