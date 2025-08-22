import nodemailer from 'nodemailer';

/**
 * Creates and configures the email transporter
 * @returns {import('nodemailer').Transporter} Configured nodemailer transporter
 * @throws {Error} When Gmail credentials are missing
 */
const createTransporter = () => {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error(
      'Gmail credentials not found. Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.'
    );
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD // Use App Password, not regular password
    }
  });
};

/**
 * Sends an email using Gmail SMTP
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} message - Email message body (can be HTML or plain text)
 * @returns {Promise<Object>} - Returns the email sending result
 */
export const sendEmail = async (to, subject, message) => {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !to) {
      throw new Error(
        'Gmail credentials or recipient email not found. Please set GMAIL_USER, GMAIL_APP_PASSWORD, and EMAIL_TO environment variables.'
      );
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject,
      html: message, // Supports HTML content
      text: message.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending email:', error.message);
    throw error;
  }
};
