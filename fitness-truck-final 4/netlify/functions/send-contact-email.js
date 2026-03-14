exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return response(405, { success: false, message: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const toEmail = process.env.CONTACT_TO_EMAIL || 'info@fitnesstruck.ch';

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

  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim();
  const message = String(payload.message || '').trim();
  const language = String(payload.language || '').trim();
  const pageUrl = String(payload.pageUrl || '').trim();
  const userAgent = String(payload.userAgent || '').trim();

  if (!name || !email || !message) {
    return response(400, { success: false, message: 'Missing required contact fields' });
  }

  const subject = `New Fitness Truck contact message from ${name}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:640px;margin:0 auto;">
      <h1 style="font-size:24px;margin-bottom:16px;">New contact message</h1>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Language:</strong> ${escapeHtml(language || 'unknown')}</p>
        <p><strong>Page:</strong> ${escapeHtml(pageUrl || 'unknown')}</p>
      </div>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;white-space:pre-wrap;">${escapeHtml(message)}</div>
      <p style="margin-top:20px;color:#666;font-size:12px;">User agent: ${escapeHtml(userAgent || 'unknown')}</p>
    </div>
  `;

  const resendPayload = {
    from: fromEmail,
    to: [toEmail],
    subject,
    html,
    reply_to: email
  };

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
      emailId: resendJson.id || null,
      toEmail
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
