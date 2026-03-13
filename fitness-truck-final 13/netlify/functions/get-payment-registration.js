const { jsonResponse, supabaseRequest } = require('./_payment-helpers');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { success: false, message: 'Method not allowed' });
  }

  try {
    const ref = String(event.queryStringParameters?.ref || '').trim();
    if (!ref) {
      return jsonResponse(400, { success: false, message: 'Missing payment reference.' });
    }

    const intents = await supabaseRequest(`/payment_intents?reference_id=eq.${encodeURIComponent(ref)}&select=*`);
    const intent = Array.isArray(intents) ? intents[0] : null;

    if (!intent) {
      return jsonResponse(404, { success: false, message: 'Payment intent not found.' });
    }

    if (String(intent.status || '').toLowerCase() !== 'confirmed' || !intent.registration_id) {
      return jsonResponse(202, { success: true, pending: true, message: 'Booking not finalized yet.' });
    }

    let registrationCreatedAt = intent.updated_at || intent.created_at || null;
    try {
      const registrations = await supabaseRequest(`/registrations?id=eq.${encodeURIComponent(intent.registration_id)}&select=id,created_at`);
      const registration = Array.isArray(registrations) ? registrations[0] : null;
      if (registration?.created_at) registrationCreatedAt = registration.created_at;
    } catch (error) {
      console.error('Registration lookup for payment booking failed:', error);
    }

    return jsonResponse(200, {
      success: true,
      booking: {
        registration_id: String(intent.registration_id || ''),
        created_at: String(registrationCreatedAt || intent.created_at || ''),
        event_id: String(intent.event_id || ''),
        event_title: String(intent.event_title || ''),
        event_date: String(intent.event_date || ''),
        event_location: String(intent.event_location || ''),
        session_id: String(intent.session_id || ''),
        session_title: String(intent.session_title || ''),
        session_start_time: String(intent.session_start_time || ''),
        session_end_time: String(intent.session_end_time || ''),
        session_exercise_type: String(intent.session_exercise_type || ''),
        session_price_chf: Number(intent.amount_chf || 0),
        event_base_price_chf: Number(intent.amount_chf || 0)
      }
    });
  } catch (error) {
    console.error('Get payment registration error:', error);
    return jsonResponse(500, { success: false, message: error.message || 'Could not load payment booking.' });
  }
};
