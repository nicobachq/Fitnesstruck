const {
  extractTransaction,
  getAuthenticatedSupabaseUser,
  jsonResponse,
  normalizeEmail,
  payrexxFormRequest,
  payrexxGet,
  readJsonBody,
  sendAdminCancellationEmail,
  sendCancellationEmail,
  supabaseRequest
} = require('./_payment-helpers');

const CANCELLATION_WINDOW_HOURS = 72;

function getAccessToken(event) {
  const headers = event.headers || {};
  const authHeader = headers.authorization || headers.Authorization || '';
  const match = String(authHeader).match(/^Bearer\s+(.+)$/i);
  return match ? String(match[1]).trim() : '';
}

function parseEventStart(eventDate, sessionStartTime) {
  const datePart = String(eventDate || '').trim();
  if (!datePart) return null;
  const timePart = String(sessionStartTime || '').trim() || '00:00';
  const isoLike = `${datePart}T${timePart.length === 5 ? `${timePart}:00` : timePart}`;
  const parsed = new Date(isoLike);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function refundNotAvailableMessage() {
  return 'This payment cannot be refunded automatically. Please contact Fitness Truck directly.';
}

async function lookupRegistrationWithContext(registrationId) {
  const [registration] = await supabaseRequest(`/registrations?id=eq.${encodeURIComponent(registrationId)}&select=*`);
  if (!registration) {
    throw new Error('Registration not found.');
  }

  const [session] = await supabaseRequest(`/sessions?id=eq.${encodeURIComponent(String(registration.session_id || ''))}&select=*`);
  if (!session) {
    throw new Error('Session not found.');
  }

  const [eventRow] = await supabaseRequest(`/events?id=eq.${encodeURIComponent(String(session.event_id || ''))}&select=*`);
  if (!eventRow) {
    throw new Error('Event not found.');
  }

  return { registration, session, eventRow };
}

async function lookupPaymentIntent(registrationId) {
  const intents = await supabaseRequest(`/payment_intents?registration_id=eq.${encodeURIComponent(registrationId)}&select=*&order=created_at.desc&limit=1`);
  return Array.isArray(intents) && intents[0] ? intents[0] : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, message: 'Method not allowed' });
  }

  try {
    const accessToken = getAccessToken(event);
    if (!accessToken) {
      return jsonResponse(401, { success: false, message: 'Please sign in again and try once more.' });
    }

    const authUser = await getAuthenticatedSupabaseUser(accessToken);
    const authEmail = normalizeEmail(authUser?.email);
    if (!authEmail) {
      return jsonResponse(401, { success: false, message: 'Could not verify your account.' });
    }

    const body = await readJsonBody(event);
    const registrationId = String(body.registrationId || '').trim();
    if (!registrationId) {
      return jsonResponse(400, { success: false, message: 'Missing registration id.' });
    }

    const { registration, session, eventRow } = await lookupRegistrationWithContext(registrationId);

    if (normalizeEmail(registration.email) !== authEmail) {
      return jsonResponse(403, { success: false, message: 'This booking does not belong to your account.' });
    }

    if (String(registration.attendance_status || '').trim().toLowerCase() === 'cancelled') {
      return jsonResponse(200, { success: true, alreadyCancelled: true, message: 'This booking was already cancelled.' });
    }

    const eventStart = parseEventStart(eventRow.date, session.start_time);
    if (!eventStart) {
      return jsonResponse(400, { success: false, message: 'This booking cannot be cancelled online right now. Please contact Fitness Truck directly.' });
    }

    const deadline = new Date(eventStart.getTime() - CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000);
    const now = new Date();
    if (now >= deadline) {
      return jsonResponse(409, {
        success: false,
        tooLate: true,
        message: `Online cancellation is no longer available within ${CANCELLATION_WINDOW_HOURS} hours of the event start.`
      });
    }

    const paymentIntent = await lookupPaymentIntent(registrationId);

    let refundTriggered = false;
    let refundTransactionId = '';
    let paymentMethod = String(paymentIntent?.payment_method || '').trim();
    let referenceId = String(paymentIntent?.reference_id || paymentIntent?.id || '').trim();
    const amountChf = Number(paymentIntent?.amount_chf || session.price_chf || eventRow.base_price_chf || 0);

    if (paymentIntent && String(paymentIntent.payrexx_transaction_id || '').trim()) {
      const originalTransactionId = String(paymentIntent.payrexx_transaction_id || '').trim();
      const transactionJson = await payrexxGet(`Transaction/${encodeURIComponent(originalTransactionId)}/`);
      const transaction = extractTransaction(transactionJson) || {};
      const transactionStatus = String(transaction.status || '').trim().toLowerCase();
      paymentMethod = String(transaction.psp || paymentMethod || '').trim();

      if (transactionStatus === 'refunded' || transactionStatus === 'partially-refunded') {
        refundTriggered = true;
        refundTransactionId = String(transaction.id || originalTransactionId);
      } else {
        try {
          const amountInCents = Math.max(0, Math.round(amountChf * 100));
          const refundJson = await payrexxFormRequest(`Transaction/${encodeURIComponent(originalTransactionId)}/refund`, amountInCents > 0 ? { amount: String(amountInCents) } : {});
          const refundTx = extractTransaction(refundJson) || refundJson || {};
          refundTriggered = true;
          refundTransactionId = String(refundTx.id || refundTx.uuid || '');
        } catch (refundError) {
          console.error('Payrexx refund error:', refundError);
          const message = String(refundError?.message || '');
          if (/refund/i.test(message) || /not possible/i.test(message) || /not available/i.test(message) || /cannot/i.test(message)) {
            return jsonResponse(409, { success: false, refundUnavailable: true, message: refundNotAvailableMessage() });
          }
          throw refundError;
        }
      }
    } else if (amountChf > 0) {
      return jsonResponse(409, {
        success: false,
        refundUnavailable: true,
        message: 'We could not find the payment details for this booking. Please contact Fitness Truck directly.'
      });
    }

    await supabaseRequest(`/registrations?id=eq.${encodeURIComponent(registrationId)}`, {
      method: 'PATCH',
      body: {
        attendance_status: 'cancelled'
      }
    });

    if (paymentIntent) {
      await supabaseRequest(`/payment_intents?id=eq.${encodeURIComponent(String(paymentIntent.id || ''))}`, {
        method: 'PATCH',
        body: {
          status: refundTriggered ? 'refunded' : 'cancelled'
        }
      });
    }

    const participant = {
      fullName: registration.full_name || paymentIntent?.full_name || authUser.user_metadata?.full_name || '',
      email: registration.email || authEmail,
      phone: registration.phone || paymentIntent?.phone || authUser.user_metadata?.phone || ''
    };
    const eventData = {
      title: eventRow.title || '',
      date: eventRow.date || '',
      location: eventRow.location || ''
    };
    const sessionData = {
      title: session.title || '',
      startTime: session.start_time || '',
      endTime: session.end_time || '',
      exerciseType: session.exercise_type || ''
    };
    const paymentData = {
      amountChf,
      method: paymentMethod,
      referenceId,
      transactionId: refundTransactionId || String(paymentIntent?.payrexx_transaction_id || '')
    };

    try {
      await sendCancellationEmail({
        participant,
        eventData,
        session: sessionData,
        payment: paymentData,
        deadlineHours: CANCELLATION_WINDOW_HOURS
      });
    } catch (emailError) {
      console.error('Participant cancellation email error:', emailError);
    }

    try {
      await sendAdminCancellationEmail({
        participant,
        eventData,
        session: sessionData,
        payment: paymentData,
        deadlineHours: CANCELLATION_WINDOW_HOURS
      });
    } catch (adminEmailError) {
      console.error('Admin cancellation email error:', adminEmailError);
    }

    return jsonResponse(200, {
      success: true,
      refunded: refundTriggered,
      message: refundTriggered
        ? 'Your booking has been cancelled and the refund has been started.'
        : 'Your booking has been cancelled.'
    });
  } catch (error) {
    console.error('Cancel registration error:', error);
    return jsonResponse(500, { success: false, message: error.message || 'Cancellation failed.' });
  }
};
