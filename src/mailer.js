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
    return {
      enabled: false,
      async sendBookingAlert() {},
      async sendBookingConfirmation() {},
      async sendReceipt() { throw new Error('Email is not set up.'); },
    };
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
    /** Sent only when a logged-in admin presses "Email receipt". */
    async sendReceipt({ to, receiptNo, clientName, pdf, fileName, link }) {
      await transport.sendMail({
        from: `"${BUSINESS.name}" <${config.mail.from}>`,
        to,
        replyTo: config.mail.notifyTo,
        subject: `Your Adventure Park booking receipt ${receiptNo}`,
        text: [
          `Dear ${clientName},`,
          '',
          'Thank you for booking with Adventure Park, Shivpuri. Your booking receipt is attached.',
          'Please carry it and a valid photo ID on your arrival date.',
          link ? `You can also open it online: ${link}` : null,
          '',
          `Questions? Call or WhatsApp ${BUSINESS.phoneDisplay}.`,
          '',
          'Adventure Park',
        ].filter((l) => l !== null).join('\n'),
        attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
      });
    },
    /**
     * Confirmation to the customer after they book. The text is fixed apart from
     * validated fields (name, date, activity, people), and the customer's own
     * message is never included, so the form cannot be used to send spam.
     */
    async sendBookingConfirmation(booking) {
      const lines = [
        `Dear ${booking.name},`,
        '',
        `Thank you for choosing ${BUSINESS.name}, Shivpuri. We have received your booking request.`,
        '',
        `Booking reference: ${booking.reference}`,
        `Activity:          ${ACTIVITIES[booking.activity] || booking.activity}`,
        `Date:              ${booking.date}`,
        `People:            ${booking.people}`,
        booking.estimate ? `Estimated price:   ${booking.estimate}` : null,
        '',
        `We will call or WhatsApp you from ${BUSINESS.phoneDisplay} to confirm your slot and the final price.`,
        'Your booking receipt will be sent to you once the advance is received.',
        '',
        'Please note: we only confirm bookings from our official number and email. We never ask for your card PIN, OTP or passwords.',
        '',
        `Address: ${BUSINESS.address}`,
        `Phone / WhatsApp: ${BUSINESS.phoneDisplay}`,
        '',
        BUSINESS.name,
      ].filter((l) => l !== null);
      try {
        await transport.sendMail({
          from: `"${BUSINESS.name}" <${config.mail.from}>`,
          to: booking.email,
          replyTo: config.mail.notifyTo,
          subject: `Booking request received: ${booking.reference}`,
          text: lines.join('\n'),
        });
      } catch (err) {
        logger.error(`[mail] Could not send confirmation for ${booking.reference}: ${err.message}`);
      }
    },
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
        `Estimate:  ${booking.estimate || '-'}`,
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
