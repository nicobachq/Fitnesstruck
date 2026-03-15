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
  const language = normalizeLanguage(payload.language || participant.language || eventData.language || 'it');

  if (!participant.email || !participant.fullName || !eventData.title || !session.title) {
    return response(400, { success: false, message: 'Missing required email data' });
  }

  const emailContent = buildRegistrationEmail({ participant, eventData, session, language });
  const resendPayload = {
    from: fromEmail,
    to: [participant.email],
    subject: emailContent.subject,
    html: emailContent.html
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

function buildRegistrationEmail({ participant, eventData, session, language }) {
  const dict = language === 'en' ? EN : IT;
  const eventDate = formatDate(eventData.date, language);
  const timeRange = [session.startTime, session.endTime].filter(Boolean).join(' - ');
  const mealLabel = getMealLabel(session.mealType || session.meal_type, language);
  const price = Number(session.priceChf || session.price_chf || 0);
  const details = [
    { label: dict.labels.event, value: eventData.title },
    { label: dict.labels.date, value: eventDate },
    { label: dict.labels.location, value: eventData.location },
    { label: dict.labels.session, value: session.title },
    { label: dict.labels.time, value: timeRange },
    { label: dict.labels.training, value: session.exerciseType || session.exercise_type }
  ];

  if (mealLabel) details.push({ label: dict.labels.meal, value: mealLabel });
  if (price > 0) details.push({ label: dict.labels.price, value: `CHF ${price.toFixed(2)}` });

  const detailsHtml = details
    .filter((item) => item.value)
    .map((item) => `
      <tr>
        <td style="padding:8px 12px 8px 0;color:#666;font-size:14px;vertical-align:top;white-space:nowrap;"><strong>${escapeHtml(item.label)}</strong></td>
        <td style="padding:8px 0;font-size:15px;">${escapeHtml(item.value)}</td>
      </tr>
    `)
    .join('');

  const html = `
    <div style="margin:0;padding:24px 0;background:#f6f6f4;">
      <div style="font-family:Arial,sans-serif;line-height:1.65;color:#111;max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e8e8e2;border-radius:20px;overflow:hidden;">
        <div style="background:#111;color:#fff;padding:28px 32px;">
          <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#d3d3d3;">Fitness Truck</p>
          <h1 style="margin:0;font-size:28px;line-height:1.2;">${escapeHtml(dict.heading)}</h1>
        </div>
        <div style="padding:28px 32px;">
          <p style="margin:0 0 16px;font-size:16px;">${escapeHtml(dict.greeting)} ${escapeHtml(getFirstName(participant.fullName))},</p>
          <p style="margin:0 0 18px;font-size:15px;color:#222;">${escapeHtml(dict.intro)}</p>

          <div style="border:1px solid #ecece6;border-radius:16px;padding:18px 20px;margin:20px 0 22px;background:#fafaf8;">
            <h2 style="margin:0 0 12px;font-size:18px;">${escapeHtml(dict.detailsHeading)}</h2>
            <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
              ${detailsHtml}
            </table>
          </div>

          <div style="border-left:4px solid #b4141b;padding:4px 0 4px 14px;margin:0 0 20px;">
            <p style="margin:0 0 8px;font-size:15px;"><strong>${escapeHtml(dict.remindersHeading)}</strong></p>
            <p style="margin:0 0 6px;font-size:14px;color:#333;">${escapeHtml(dict.reminderArrival)}</p>
            <p style="margin:0 0 6px;font-size:14px;color:#333;">${escapeHtml(dict.reminderGear)}</p>
            <p style="margin:0;font-size:14px;color:#333;">${escapeHtml(dict.reminderCancel)}</p>
          </div>

          <p style="margin:0 0 18px;font-size:15px;color:#222;">${escapeHtml(dict.outro)}</p>
          <p style="margin:0;font-size:15px;">${escapeHtml(dict.signoff)}<br><strong>Fitness Truck</strong></p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: `${dict.subjectPrefix}: ${eventData.title}`,
    html
  };
}

function getMealLabel(mealType, language) {
  switch (normalizeMealType(mealType)) {
    case 'breakfast':
      return language === 'en' ? 'Breakfast included' : 'Colazione inclusa';
    case 'lunch':
      return language === 'en' ? 'Lunch included' : 'Pranzo incluso';
    case 'supper':
      return language === 'en' ? 'Supper included' : 'Cena inclusa';
    default:
      return '';
  }
}

function normalizeMealType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['breakfast', 'lunch', 'supper'].includes(normalized) ? normalized : 'none';
}

function normalizeLanguage(value) {
  return String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'it';
}

function getFirstName(fullName) {
  return String(fullName || '').trim().split(/\s+/).filter(Boolean)[0] || String(fullName || '').trim();
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

function formatDate(dateString, language) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const locale = language === 'en' ? 'en-CH' : 'it-CH';
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

const IT = {
  subjectPrefix: 'Prenotazione Fitness Truck confermata',
  heading: 'La tua prenotazione è confermata',
  greeting: 'Ciao',
  intro: 'Grazie per aver prenotato la tua esperienza Fitness Truck. Qui sotto trovi tutti i dettagli della tua prossima sessione.',
  detailsHeading: 'Dettagli della prenotazione',
  remindersHeading: 'Da ricordare',
  reminderArrival: 'Ti consigliamo di arrivare con qualche minuto di anticipo per iniziare con calma.',
  reminderGear: 'Porta un outfit adatto, acqua e uno strato caldo in più se necessario.',
  reminderCancel: 'Puoi cancellare direttamente dal tuo account fino a 72 ore prima dell'evento.',
  outro: 'Se hai domande o devi aggiornare qualche informazione, rispondi pure a questa email.',
  signoff: 'A presto',
  labels: {
    event: 'Evento',
    date: 'Data',
    location: 'Location',
    session: 'Sessione',
    time: 'Orario',
    training: 'Allenamento',
    meal: 'Pasto incluso',
    price: 'Prezzo'
  }
};

const EN = {
  subjectPrefix: 'Fitness Truck booking confirmed',
  heading: 'Your booking is confirmed',
  greeting: 'Hi',
  intro: 'Thank you for booking your Fitness Truck experience. Below you will find all the details of your upcoming session.',
  detailsHeading: 'Booking details',
  remindersHeading: 'Useful reminders',
  reminderArrival: 'Please arrive a few minutes early so everything can start smoothly.',
  reminderGear: 'Bring suitable training clothes, water, and an extra warm layer if needed.',
  reminderCancel: 'You can cancel directly from your account up to 72 hours before the event.',
  outro: 'If you have any questions or need to update any information, simply reply to this email.',
  signoff: 'See you soon',
  labels: {
    event: 'Event',
    date: 'Date',
    location: 'Location',
    session: 'Session',
    time: 'Time',
    training: 'Training',
    meal: 'Meal included',
    price: 'Price'
  }
};
