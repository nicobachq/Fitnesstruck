exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return response(405, { success: false, message: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.REGISTRATION_REPLY_TO || '';

  if (!apiKey || !fromEmail) {
    return response(500, {
      success: false,
      message: 'Email service is not configured yet. Add RESEND_API_KEY and RESEND_FROM_EMAIL in Netlify.'
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return response(400, { success: false, message: 'Invalid JSON body' });
  }

  const participant = payload.participant || {};
  const eventData = payload.event || {};
  const session = payload.session || {};

  if (!participant.email || !participant.fullName || !eventData.title || !session.title) {
    return response(400, { success: false, message: 'Missing required email data' });
  }

  const subject = `Fitness Truck registration confirmed: ${eventData.title}`;
  const priceLine = session.priceChf && Number(session.priceChf) > 0 ? `<p><strong>Price:</strong> CHF ${Number(session.priceChf)}</p>` : '';

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

  const resendPayload = {
    from: fromEmail,
    to: [participant.email],
    subject,
    html
  };

  if (replyTo) resendPayload.reply_to = replyTo;

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resendPayload)
    });

    const resendJson = await resendResponse.json();

    if (!resendResponse.ok) {
      return response(resendResponse.status, {
        success: false,
        message: resendJson.message || 'Resend API error',
        details: resendJson
      });
    }

    return response(200, {
      success: true,
      emailId: resendJson.id || null
    });
  } catch (error) {
    return response(500, { success: false, message: error.message || 'Unexpected email error' });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
