const {
  extractGatewayInfo,
  jsonResponse,
  makeReferenceId,
  normalizeEmail,
  payrexxFormRequest,
  readJsonBody,
  splitFullName,
  supabaseRequest
} = require('./_payment-helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, message: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(event);
    const participant = body.participant || {};
    const eventData = body.event || {};
    const sessionData = body.session || {};
    const sessionId = String(sessionData.id || '').trim();
    const email = normalizeEmail(participant.email);

    if (!sessionId || !email || !participant.fullName || !participant.phone || !participant.age || !participant.gender || !participant.emergencyContactName || !participant.emergencyContactPhone || !participant.consentGiven || !participant.waiverAccepted) {
      return jsonResponse(400, { success: false, message: 'Missing required booking fields.' });
    }

    const [session] = await supabaseRequest(`/sessions?id=eq.${encodeURIComponent(sessionId)}&select=*`);
    if (!session) {
      return jsonResponse(404, { success: false, message: 'Session not found.' });
    }

    const [eventRow] = await supabaseRequest(`/events?id=eq.${encodeURIComponent(session.event_id)}&select=*`);
    if (!eventRow) {
      return jsonResponse(404, { success: false, message: 'Event not found.' });
    }

    if (eventRow.registration_open === false) {
      return jsonResponse(400, { success: false, message: 'Registration for this event is currently closed.' });
    }

    if (session.registration_open === false) {
      return jsonResponse(400, { success: false, message: 'Registration for this session is currently closed.' });
    }

    const [duplicateRegistration] = await supabaseRequest(`/registrations?session_id=eq.${encodeURIComponent(sessionId)}&email=eq.${encodeURIComponent(email)}&attendance_status=neq.cancelled&select=id`);
    if (duplicateRegistration) {
      return jsonResponse(400, { success: false, message: 'You are already registered for this session.' });
    }

    const activeRegistrations = await supabaseRequest(`/registrations?session_id=eq.${encodeURIComponent(sessionId)}&attendance_status=neq.cancelled&select=id`);
    const currentCount = Array.isArray(activeRegistrations) ? activeRegistrations.length : 0;
    const maxParticipants = Number(session.max_participants || 0);
    if (maxParticipants > 0 && currentCount >= maxParticipants) {
      return jsonResponse(400, { success: false, message: 'This session is already full.' });
    }

    const sessionPrice = Number(session.price_chf || 0);
    const eventPrice = Number(eventRow.base_price_chf || 0);
    const priceChf = sessionPrice > 0 ? sessionPrice : eventPrice;
    if (!(priceChf > 0)) {
      return jsonResponse(400, { success: false, message: 'This session does not require online payment.' });
    }

    const referenceId = makeReferenceId();
    const amountInCents = Math.round(priceChf * 100);
    const { forename, surname } = splitFullName(participant.fullName);

    await supabaseRequest('/payment_intents', {
      method: 'POST',
      body: {
        id: referenceId,
        reference_id: referenceId,
        status: 'pending',
        currency: 'CHF',
        amount_chf: priceChf,
        event_id: String(eventRow.id),
        session_id: String(session.id),
        email,
        full_name: String(participant.fullName).trim(),
        phone: String(participant.phone).trim(),
        age: Number(participant.age),
        gender: String(participant.gender || '').trim(),
        food_allergies: String(participant.foodAllergies || '').trim(),
        medical_conditions: String(participant.medicalConditions || '').trim(),
        emergency_contact_name: String(participant.emergencyContactName).trim(),
        emergency_contact_phone: String(participant.emergencyContactPhone).trim(),
        consent_given: !!participant.consentGiven,
        waiver_accepted: !!participant.waiverAccepted,
        language: body.language === 'en' ? 'en' : 'it',
        event_title: String(eventData.title || eventRow.title || '').trim(),
        event_date: String(eventData.date || eventRow.date || '').trim(),
        event_location: String(eventData.location || eventRow.location || '').trim(),
        session_title: String(sessionData.title || session.title || '').trim(),
        session_start_time: String(sessionData.startTime || session.start_time || '').trim(),
        session_end_time: String(sessionData.endTime || session.end_time || '').trim(),
        session_exercise_type: String(sessionData.exerciseType || session.exercise_type || '').trim()
      }
    });

    const successRedirectUrl = `${process.env.SITE_URL.replace(/\/$/, '')}/index.html?payrexx=success&ref=${encodeURIComponent(referenceId)}#events`;
    const failedRedirectUrl = `${process.env.SITE_URL.replace(/\/$/, '')}/index.html?payrexx=failed&ref=${encodeURIComponent(referenceId)}#events`;
    const cancelRedirectUrl = `${process.env.SITE_URL.replace(/\/$/, '')}/index.html?payrexx=cancelled&ref=${encodeURIComponent(referenceId)}#events`;

    const gatewayPayload = {
      amount: String(amountInCents),
      currency: 'CHF',
      purpose: `Fitness Truck · ${eventRow.title} · ${session.title}`,
      referenceId,
      successRedirectUrl,
      failedRedirectUrl,
      cancelRedirectUrl,
      skipResultPage: '1',
      validity: '3600',
      'basket[0][name]': `${eventRow.title} – ${session.title}`,
      'basket[0][quantity]': '1',
      'basket[0][price]': String(amountInCents),
      'basket[0][vatRate]': '0',
      'fields[email][value]': email,
      'fields[phone][value]': String(participant.phone).trim(),
      'fields[forename][value]': forename,
      'fields[surname][value]': surname
    };

    const gatewayJson = await payrexxFormRequest('Gateway/', gatewayPayload);
    const gatewayInfo = extractGatewayInfo(gatewayJson);

    if (!gatewayInfo.link) {
      throw new Error('Payrexx did not return a checkout link.');
    }

    await supabaseRequest(`/payment_intents?reference_id=eq.${encodeURIComponent(referenceId)}`, {
      method: 'PATCH',
      body: {
        status: 'gateway_created',
        payrexx_gateway_id: gatewayInfo.id || null
      }
    });

    return jsonResponse(200, {
      success: true,
      redirectUrl: gatewayInfo.link,
      referenceId
    });
  } catch (error) {
    console.error('Create Payrexx payment error:', error);
    return jsonResponse(500, { success: false, message: error.message || 'Payment could not be started.' });
  }
};
