const crypto = require('crypto');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function getEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function readJsonBody(event) {
  try {
    return JSON.parse(event.body || '{}');
  } catch (error) {
    throw new Error('Invalid JSON body');
  }
}

function splitFullName(fullName = '') {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { forename: '', surname: '' };
  if (parts.length === 1) return { forename: parts[0], surname: parts[0] };
  return {
    forename: parts.slice(0, -1).join(' '),
    surname: parts.slice(-1).join(' ')
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function makeReferenceId() {
  return `ftpay_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function getSupabaseProjectUrl() {
  return getEnv('SUPABASE_URL').replace(/\/$/, '');
}

function getSupabaseBaseUrl() {
  return `${getSupabaseProjectUrl()}/rest/v1`;
}

function getSupabaseHeaders(extra = {}) {
  const key = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
}

async function supabaseRequest(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${getSupabaseBaseUrl()}${path}`, {
    method,
    headers: getSupabaseHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers
    }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = null;
  }

  if (!response.ok) {
    const message = json?.message || json?.error_description || json?.hint || text || `Supabase request failed (${response.status})`;
    throw new Error(message);
  }

  return json;
}

async function supabaseRpc(functionName, payload) {
  return supabaseRequest(`/rpc/${functionName}`, {
    method: 'POST',
    body: payload,
    headers: { Prefer: 'return=representation' }
  });
}

async function syncSessionRegisteredCount(sessionId) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return 0;

  const registrations = await supabaseRequest(`/registrations?session_id=eq.${encodeURIComponent(normalizedSessionId)}&select=id,attendance_status`);
  const liveCount = Array.isArray(registrations)
    ? registrations.filter((row) => String(row?.attendance_status || '').trim().toLowerCase() !== 'cancelled').length
    : 0;

  await supabaseRequest(`/sessions?id=eq.${encodeURIComponent(normalizedSessionId)}`, {
    method: 'PATCH',
    body: { registered_count: liveCount }
  });

  return liveCount;
}

async function getAuthenticatedSupabaseUser(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) throw new Error('Missing access token.');

  const response = await fetch(`${getSupabaseProjectUrl()}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: getEnv('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: `Bearer ${token}`
    }
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = null;
  }

  if (!response.ok) {
    const message = json?.msg || json?.message || json?.error_description || text || `Supabase auth failed (${response.status})`;
    throw new Error(message);
  }

  return json;
}

function getPayrexxApiUrl(path) {
  const instance = encodeURIComponent(getEnv('PAYREXX_INSTANCE'));
  const cleanPath = path.replace(/^\//, '');
  return `https://api.payrexx.com/v1.14/${cleanPath}${cleanPath.includes('?') ? '&' : '?'}instance=${instance}`;
}

async function payrexxFormRequest(path, params) {
  const apiKey = getEnv('PAYREXX_API_KEY');
  const response = await fetch(getPayrexxApiUrl(path), {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params).toString()
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = null;
  }

  if (!response.ok) {
    const message = json?.message || json?.error || text || `Payrexx request failed (${response.status})`;
    throw new Error(message);
  }

  return json;
}

async function payrexxGet(path) {
  const apiKey = getEnv('PAYREXX_API_KEY');
  const response = await fetch(getPayrexxApiUrl(path), {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json'
    }
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = null;
  }

  if (!response.ok) {
    const message = json?.message || json?.error || text || `Payrexx request failed (${response.status})`;
    throw new Error(message);
  }

  return json;
}

function pickFirstObject(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] || null;
  if (typeof value === 'object') return value;
  return null;
}

function extractGatewayInfo(payload) {
  const candidates = [
    payload,
    payload?.data,
    pickFirstObject(payload?.data),
    payload?.gateway,
    payload?.response,
    pickFirstObject(payload?.response)
  ].filter(Boolean);

  for (const candidate of candidates) {
    const link = candidate.link || candidate.url || candidate.paymentLink || candidate.href;
    const id = candidate.id || candidate.uuid || candidate.paymentLinkId || candidate.referenceId;
    if (link || id) {
      return { link: link || '', id: id ? String(id) : '' };
    }
  }

  return { link: '', id: '' };
}

function extractTransaction(payload) {
  if (!payload) return null;
  const candidates = [
    payload.transaction,
    payload.data,
    pickFirstObject(payload.data),
    payload
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && (candidate.id || candidate.uuid || candidate.referenceId || candidate.status)) {
      return candidate;
    }
  }

  return null;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendRegistrationEmail({ participant, eventData, session }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.REGISTRATION_REPLY_TO || '';

  if (!apiKey || !fromEmail) {
    return { success: false, skipped: true, message: 'Email service is not configured.' };
  }

  const subject = `Fitness Truck registration confirmed: ${eventData.title}`;
  const priceLine = session.priceChf && Number(session.priceChf) > 0 ? `<p><strong>Price:</strong> CHF ${Number(session.priceChf).toFixed(2)}</p>` : '';

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:640px;margin:0 auto;">
      <h1 style="font-size:24px;margin-bottom:16px;">Your Fitness Truck registration is confirmed</h1>
      <p>Hi ${escapeHtml(participant.fullName)},</p>
      <p>Thank you for registering. Here are your session details:</p>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <p><strong>Event:</strong> ${escapeHtml(eventData.title)}</p>
        <p><strong>Date:</strong> ${escapeHtml(formatDate(eventData.date))}</p>
        <p><strong>Location:</strong> ${escapeHtml(eventData.location || '')}</p>
        <p><strong>Session:</strong> ${escapeHtml(session.title)}</p>
        <p><strong>Time:</strong> ${escapeHtml(session.startTime || '')} - ${escapeHtml(session.endTime || '')}</p>
        <p><strong>Training:</strong> ${escapeHtml(session.exerciseType || '')}</p>
        ${priceLine}
      </div>
      <p>Please arrive a few minutes early and bring training clothes, water, and anything you may personally need.</p>
      <p>If any of your details change, reply to this email and let us know.</p>
      <p>See you soon,<br><strong>Fitness Truck</strong></p>
    </div>
  `;

  const payload = {
    from: fromEmail,
    to: [participant.email],
    subject,
    html
  };

  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.message || 'Resend API error');
  }

  return { success: true, emailId: json?.id || null };
}


async function sendAdminPaymentEmail({ participant, eventData, session, payment }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const toEmail = process.env.CONTACT_TO_EMAIL || 'info@fitnesstruck.ch';
  const replyTo = participant?.email ? String(participant.email).trim() : '';

  if (!apiKey || !fromEmail || !toEmail) {
    return { success: false, skipped: true, message: 'Admin email service is not configured.' };
  }

  const subject = `New paid Fitness Truck booking: ${eventData.title}`;
  const paymentMethod = String(payment?.method || '').trim() || 'Unknown';
  const amountLine = payment?.amountChf && Number(payment.amountChf) > 0
    ? `CHF ${Number(payment.amountChf).toFixed(2)}`
    : 'Unknown';

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:680px;margin:0 auto;">
      <h1 style="font-size:24px;margin-bottom:16px;">New paid booking received</h1>
      <p>A payment has been confirmed for a Fitness Truck booking.</p>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <h2 style="font-size:18px;margin:0 0 12px;">Participant</h2>
        <p><strong>Name:</strong> ${escapeHtml(participant.fullName || '')}</p>
        <p><strong>Email:</strong> ${escapeHtml(participant.email || '')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(participant.phone || '')}</p>
        <p><strong>Age:</strong> ${escapeHtml(participant.age || '')}</p>
        <p><strong>Gender:</strong> ${escapeHtml(participant.gender || '')}</p>
        <p><strong>Emergency contact:</strong> ${escapeHtml(participant.emergencyContactName || '')} — ${escapeHtml(participant.emergencyContactPhone || '')}</p>
        ${participant.foodAllergies ? `<p><strong>Food allergies:</strong> ${escapeHtml(participant.foodAllergies)}</p>` : ''}
        ${participant.medicalConditions ? `<p><strong>Medical conditions:</strong> ${escapeHtml(participant.medicalConditions)}</p>` : ''}
      </div>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <h2 style="font-size:18px;margin:0 0 12px;">Booking</h2>
        <p><strong>Event:</strong> ${escapeHtml(eventData.title || '')}</p>
        <p><strong>Date:</strong> ${escapeHtml(formatDate(eventData.date) || '')}</p>
        <p><strong>Location:</strong> ${escapeHtml(eventData.location || '')}</p>
        <p><strong>Session:</strong> ${escapeHtml(session.title || '')}</p>
        <p><strong>Time:</strong> ${escapeHtml(session.startTime || '')} - ${escapeHtml(session.endTime || '')}</p>
        <p><strong>Training:</strong> ${escapeHtml(session.exerciseType || '')}</p>
        <p><strong>Amount paid:</strong> ${escapeHtml(amountLine)}</p>
        <p><strong>Payment method:</strong> ${escapeHtml(paymentMethod)}</p>
        <p><strong>Reference ID:</strong> ${escapeHtml(payment.referenceId || '')}</p>
        <p><strong>Payrexx transaction ID:</strong> ${escapeHtml(payment.transactionId || '')}</p>
      </div>
    </div>
  `;

  const payload = {
    from: fromEmail,
    to: [toEmail],
    subject,
    html
  };

  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json?.message || 'Resend API error');
  }

  return { success: true, emailId: json?.id || null, toEmail };
}


async function sendCancellationEmail({ participant, eventData, session, payment, deadlineHours = 72 }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.REGISTRATION_REPLY_TO || '';

  if (!apiKey || !fromEmail || !participant?.email) {
    return { success: false, skipped: true, message: 'Email service is not configured.' };
  }

  const subject = `Fitness Truck cancellation confirmed: ${eventData.title}`;
  const amountLine = payment?.amountChf && Number(payment.amountChf) > 0
    ? `<p><strong>Refund:</strong> CHF ${Number(payment.amountChf).toFixed(2)} initiated to your original payment method.</p>`
    : '';

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:640px;margin:0 auto;">
      <h1 style="font-size:24px;margin-bottom:16px;">Your Fitness Truck booking has been cancelled</h1>
      <p>Hi ${escapeHtml(participant.fullName || '')},</p>
      <p>Your place has been cancelled successfully.</p>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <p><strong>Event:</strong> ${escapeHtml(eventData.title || '')}</p>
        <p><strong>Date:</strong> ${escapeHtml(formatDate(eventData.date) || '')}</p>
        <p><strong>Location:</strong> ${escapeHtml(eventData.location || '')}</p>
        <p><strong>Session:</strong> ${escapeHtml(session.title || '')}</p>
        <p><strong>Time:</strong> ${escapeHtml(session.startTime || '')} - ${escapeHtml(session.endTime || '')}</p>
        ${amountLine}
      </div>
      <p>Online cancellation is available until ${escapeHtml(String(deadlineHours))} hours before the event start. After that point, refunds are no longer automatic unless Fitness Truck cancels the event.</p>
      <p>If you have any questions, reply to this email and we will help.</p>
      <p>Fitness Truck</p>
    </div>
  `;

  const payload = { from: fromEmail, to: [participant.email], subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.message || 'Resend API error');

  return { success: true, emailId: json?.id || null };
}

async function sendAdminCancellationEmail({ participant, eventData, session, payment, deadlineHours = 72 }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const toEmail = process.env.CONTACT_TO_EMAIL || 'info@fitnesstruck.ch';
  const replyTo = participant?.email ? String(participant.email).trim() : '';

  if (!apiKey || !fromEmail || !toEmail) {
    return { success: false, skipped: true, message: 'Admin email service is not configured.' };
  }

  const subject = `Fitness Truck cancellation: ${eventData.title}`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:680px;margin:0 auto;">
      <h1 style="font-size:24px;margin-bottom:16px;">Booking cancelled and refund started</h1>
      <p>A participant cancelled within the ${escapeHtml(String(deadlineHours))}-hour refund window.</p>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <p><strong>Name:</strong> ${escapeHtml(participant.fullName || '')}</p>
        <p><strong>Email:</strong> ${escapeHtml(participant.email || '')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(participant.phone || '')}</p>
      </div>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <p><strong>Event:</strong> ${escapeHtml(eventData.title || '')}</p>
        <p><strong>Date:</strong> ${escapeHtml(formatDate(eventData.date) || '')}</p>
        <p><strong>Location:</strong> ${escapeHtml(eventData.location || '')}</p>
        <p><strong>Session:</strong> ${escapeHtml(session.title || '')}</p>
        <p><strong>Time:</strong> ${escapeHtml(session.startTime || '')} - ${escapeHtml(session.endTime || '')}</p>
        <p><strong>Refund amount:</strong> CHF ${escapeHtml(Number(payment?.amountChf || 0).toFixed(2))}</p>
        <p><strong>Payment method:</strong> ${escapeHtml(payment?.method || '')}</p>
        <p><strong>Reference ID:</strong> ${escapeHtml(payment?.referenceId || '')}</p>
        <p><strong>Payrexx transaction ID:</strong> ${escapeHtml(payment?.transactionId || '')}</p>
      </div>
    </div>
  `;

  const payload = { from: fromEmail, to: [toEmail], subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json?.message || 'Resend API error');

  return { success: true, emailId: json?.id || null, toEmail };
}

module.exports = {
  extractGatewayInfo,
  extractTransaction,
  formatDate,
  getAuthenticatedSupabaseUser,
  getEnv,
  jsonResponse,
  makeReferenceId,
  normalizeEmail,
  payrexxFormRequest,
  payrexxGet,
  readJsonBody,
  sendAdminCancellationEmail,
  sendAdminPaymentEmail,
  sendCancellationEmail,
  sendRegistrationEmail,
  splitFullName,
  supabaseRequest,
  supabaseRpc,
  syncSessionRegisteredCount
};
