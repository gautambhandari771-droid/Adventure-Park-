'use strict';

const nodemailer = require('nodemailer');
const { ACTIVITIES, BUSINESS } = require('./business');

/**
 * Sends a plain-text alert to the business inbox for each new booking.
 * Plain text only: customer input is never rendered as HTML in email.
 * No email is ever sent to an address typed by a visitor, so the form
 * cannot be abused to send spam to third parties.
 */
function createMailer(config, logger = console) {
  if (!config.mail.host || !config.mail.user || !config.mail.pass) {
    return { enabled: false, async sendBookingAlert() {} };
  }

  const transport = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: { user: config.mail.user, pass: config.mail.pass },
    requireTLS: true,
    tls: { minVersion: 'TLSv1.2' },
  });

  return {
    enabled: true,
    async sendBookingAlert(booking) {
      const lines = [
        `New booking request ${booking.reference}`,
        '',
        `Name:      ${booking.name}`,
        `Phone:     ${booking.phone}`,
        `WhatsApp:  https://wa.me/${booking.phone.replace(/\D/g, '')}`,
        `Email:     ${booking.email || '-'}`,
        `Activity:  ${ACTIVITIES[booking.activity] || booking.activity}`,
        `Date:      ${booking.date}`,
        `People:    ${booking.people}`,
        '',
        'Message:',
        booking.message || '-',
        '',
        'Open the admin panel to update this booking.',
      ];
      try {
        await transport.sendMail({
          from: `"${BUSINESS.name} Website" <${config.mail.from}>`,
          to: config.mail.notifyTo,
          replyTo: booking.email || undefined,
          subject: `New booking ${booking.reference}: ${booking.date}, ${booking.people} people`,
          text: lines.join('\n'),
        });
      } catch (err) {
        logger.error(`[mail] Could not send alert for ${booking.reference}: ${err.message}`);
      }
    },
  };
}

module.exports = { createMailer };
