const emailjs = require('@emailjs/nodejs');

const SERVICE_ID = 'service_izzk84f';
const PUBLIC_KEY = 'MhN-7pt_rP2OqUEcc';
const PRIVATE_KEY = 'Vx8x3t8IQA1N-Y-GqOZBS';

/**
 * Send password reset email using EmailJS
 */
async function sendPasswordResetEmail(toEmail, resetToken, userName) {
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:8080'}/reset-password?token=${resetToken}`;
  
  const templateParams = {
    to_email: toEmail,
    to_name: userName || 'User',
    reset_url: resetUrl,
    reset_token: resetToken,
  };

  try {
    await emailjs.send(
      SERVICE_ID,
      'template_reset_password', // You'll need to create this template in EmailJS
      templateParams,
      {
        publicKey: PUBLIC_KEY,
        privateKey: PRIVATE_KEY,
      }
    );
    console.log(`✅ Password reset email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error);
    throw new Error('Failed to send email');
  }
}

/**
 * Send welcome email
 */
async function sendWelcomeEmail(toEmail, userName) {
  const templateParams = {
    to_email: toEmail,
    to_name: userName || 'User',
  };

  try {
    await emailjs.send(
      SERVICE_ID,
      'template_welcome', // Optional: create welcome template
      templateParams,
      {
        publicKey: PUBLIC_KEY,
        privateKey: PRIVATE_KEY,
      }
    );
    console.log(`✅ Welcome email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
    // Don't throw - welcome email failure shouldn't block registration
    return false;
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail,
};
