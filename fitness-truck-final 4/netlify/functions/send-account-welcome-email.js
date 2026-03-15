exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return response(405, { success: false, message: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const replyTo = process.env.REGISTRATION_REPLY_TO || process.env.CONTACT_TO_EMAIL || 'info@fitnesstruck.ch';
  const siteUrl = process.env.URL || 'https://fitnesstruck.ch';

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

  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.fullName || '').trim();
  const phone = String(payload.phone || '').trim();
  const language = String(payload.language || 'it').trim().toLowerCase() === 'en' ? 'en' : 'it';

  if (!email) {
    return response(400, { success: false, message: 'Missing required email' });
  }

  const firstName = getFirstName(fullName);
  const subject = language === 'en'
    ? 'Your Fitness Truck account is ready'
    : 'Il tuo account Fitness Truck è pronto';

  const html = language === 'en'
    ? buildEnglishEmail({ firstName, fullName, email, phone, siteUrl })
    : buildItalianEmail({ firstName, fullName, email, phone, siteUrl });

  const resendPayload = {
    from: fromEmail,
    to: [email],
    subject,
    html,
    reply_to: replyTo
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

    const resendJson = await resendResponse.json().catch(() => ({}));

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

function buildEnglishEmail({ firstName, email, phone, siteUrl }) {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';
  const phoneLine = phone ? `<p style="margin:0 0 8px;"><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : '';
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:640px;margin:0 auto;">
      <h1 style="font-size:24px;margin-bottom:16px;">Your Fitness Truck account is ready</h1>
      <p>${greeting}</p>
      <p>Welcome to Fitness Truck. Your account has been created successfully and you can now log in with your email and password.</p>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${phoneLine}
      </div>
      <p>You are ready to explore upcoming events, manage your bookings, and join your next outdoor fitness experience.</p>
      <p><a href="${escapeHtml(siteUrl)}/account.html" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">Open your account</a></p>
      <p>If you have any questions, simply reply to this email.</p>
      <p>See you soon,<br><strong>Fitness Truck</strong></p>
    </div>
  `;
}

function buildItalianEmail({ firstName, email, phone, siteUrl }) {
  const greeting = firstName ? `Ciao ${escapeHtml(firstName)},` : 'Ciao,';
  const phoneLine = phone ? `<p style="margin:0 0 8px;"><strong>Telefono:</strong> ${escapeHtml(phone)}</p>` : '';
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;max-width:640px;margin:0 auto;">
      <h1 style="font-size:24px;margin-bottom:16px;">Il tuo account Fitness Truck è pronto</h1>
      <p>${greeting}</p>
      <p>Benvenuto in Fitness Truck. Il tuo account è stato creato con successo e ora puoi accedere con la tua email e password.</p>
      <div style="border:1px solid #ddd;border-radius:12px;padding:16px;margin:20px 0;">
        <p style="margin:0 0 8px;"><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${phoneLine}
      </div>
      <p>Ora puoi scoprire i prossimi eventi, gestire le tue prenotazioni e unirti alla tua prossima esperienza outdoor.</p>
      <p><a href="${escapeHtml(siteUrl)}/account.html" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700;">Apri il tuo account</a></p>
      <p>Se hai domande, rispondi pure a questa email.</p>
      <p>A presto,<br><strong>Fitness Truck</strong></p>
    </div>
  `;
}

function getFirstName(fullName) {
  const value = String(fullName || '').trim();
  if (!value) return '';
  return value.split(/\s+/)[0] || '';
}

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
