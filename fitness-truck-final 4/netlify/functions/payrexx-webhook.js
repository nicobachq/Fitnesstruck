const {
  extractTransaction,
  jsonResponse,
  normalizeEmail,
  payrexxGet,
  sendAdminPaymentEmail,
  sendRegistrationEmail,
  supabaseRequest,
  supabaseRpc,
  syncSessionRegisteredCount
} = require('./_payment-helpers');

function extractReferenceFromPurpose(value) {
  const text = String(value || '');
  const match = text.match(/\[(ftpay_[^\]]+)\]/i);
  return match ? String(match[1]).trim() : '';
}


async function cleanupRefundedRegistration(intent) {
  const registrationId = String(intent?.registration_id || '').trim();
  if (!registrationId) return false;

  try {
    try {
      await supabaseRequest(`/registrations?id=eq.${encodeURIComponent(registrationId)}`, {
        method: 'PATCH',
        body: { attendance_status: 'cancelled' }
      });
    } catch (patchError) {
      console.error('Refund cleanup patch warning:', patchError);
    }

    await supabaseRequest(`/registrations?id=eq.${encodeURIComponent(registrationId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });

    try {
      await syncSessionRegisteredCount(intent?.session_id);
    } catch (countError) {
      console.error('Refund cleanup session count warning:', countError);
    }

    return true;
  } catch (deleteError) {
    console.error('Refund cleanup delete warning:', deleteError);
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, message: 'Method not allowed' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const incomingTransaction = extractTransaction(payload);
    if (!incomingTransaction) {
      return jsonResponse(400, { success: false, message: 'Invalid webhook payload.' });
    }

    const referenceId = String(incomingTransaction.referenceId || '').trim() || extractReferenceFromPurpose(incomingTransaction.purpose || incomingTransaction.description || '');
    if (!referenceId) {
      console.log('Payrexx webhook ignored: missing referenceId and no fallback in purpose.');
      return jsonResponse(200, { success: true, ignored: true, message: 'Missing referenceId.' });
    }

    const intents = await supabaseRequest(`/payment_intents?reference_id=eq.${encodeURIComponent(referenceId)}&select=*`);
    const intent = Array.isArray(intents) ? intents[0] : null;
    if (!intent) {
      console.log('Payrexx webhook ignored: unknown referenceId', referenceId);
      return jsonResponse(200, { success: true, ignored: true, message: 'Unknown referenceId.' });
    }

    const incomingStatus = String(incomingTransaction.status || '').trim().toLowerCase();
    if (incomingStatus && incomingStatus !== 'confirmed') {
      const refundedStatus = incomingStatus === 'refunded' || incomingStatus === 'partially-refunded';
      if (refundedStatus && intent.registration_id) {
        await cleanupRefundedRegistration(intent);
      }

      await supabaseRequest(`/payment_intents?reference_id=eq.${encodeURIComponent(referenceId)}`, {
        method: 'PATCH',
        body: {
          status: incomingStatus,
          payrexx_transaction_id: incomingTransaction.id ? String(incomingTransaction.id) : intent.payrexx_transaction_id,
          payment_method: incomingTransaction.psp || intent.payment_method || null,
          registration_id: refundedStatus ? null : intent.registration_id
        }
      });
      console.log('Payrexx webhook updated non-confirmed status', { referenceId, incomingStatus, refundedStatus });
      return jsonResponse(200, { success: true, processed: true, status: incomingStatus });
    }

    const transactionId = Number(incomingTransaction.id || 0);
    if (!transactionId) {
      return jsonResponse(400, { success: false, message: 'Missing transaction id.' });
    }

    const transactionJson = await payrexxGet(`Transaction/${transactionId}/`);
    const verifiedTransaction = extractTransaction(transactionJson);
    if (!verifiedTransaction) {
      throw new Error('Could not verify Payrexx transaction.');
    }

    const verifiedStatus = String(verifiedTransaction.status || '').trim().toLowerCase();
    if (verifiedStatus !== 'confirmed') {
      const refundedStatus = verifiedStatus === 'refunded' || verifiedStatus === 'partially-refunded';
      if (refundedStatus && intent.registration_id) {
        await cleanupRefundedRegistration(intent);
      }

      await supabaseRequest(`/payment_intents?reference_id=eq.${encodeURIComponent(referenceId)}`, {
        method: 'PATCH',
        body: {
          status: verifiedStatus || 'unknown',
          payrexx_transaction_id: String(verifiedTransaction.id || transactionId),
          payment_method: verifiedTransaction.psp || intent.payment_method || null,
          registration_id: refundedStatus ? null : intent.registration_id
        }
      });
      console.log('Payrexx webhook verified non-confirmed status', { referenceId, verifiedStatus, refundedStatus });
      return jsonResponse(200, { success: true, processed: true, status: verifiedStatus || 'unknown' });
    }

    const verifiedReferenceId = String(verifiedTransaction.referenceId || '').trim() || extractReferenceFromPurpose(verifiedTransaction.purpose || verifiedTransaction.description || '');
    if (verifiedReferenceId !== referenceId) {
      throw new Error('Reference mismatch while verifying payment.');
    }

    const expectedAmount = Math.round(Number(intent.amount_chf || 0) * 100);
    const paidAmount = Number(verifiedTransaction.amount || 0);
    if (expectedAmount !== paidAmount) {
      await supabaseRequest(`/payment_intents?reference_id=eq.${encodeURIComponent(referenceId)}`, {
        method: 'PATCH',
        body: {
          status: 'amount_mismatch',
          payrexx_transaction_id: String(verifiedTransaction.id || transactionId),
          payment_method: verifiedTransaction.psp || intent.payment_method || null
        }
      });
      return jsonResponse(409, { success: false, message: 'Paid amount does not match booking amount.' });
    }

    if (intent.registration_id) {
      console.log('Payrexx webhook already finalized', { referenceId, registrationId: intent.registration_id });
      return jsonResponse(200, { success: true, processed: true, registrationId: intent.registration_id });
    }

    const registrationPayload = {
      p_session_id: intent.session_id,
      p_email: normalizeEmail(intent.email),
      p_full_name: intent.full_name,
      p_phone: intent.phone,
      p_age: Number(intent.age),
      p_gender: intent.gender,
      p_food_allergies: intent.food_allergies || '',
      p_medical_conditions: intent.medical_conditions || '',
      p_emergency_contact_name: intent.emergency_contact_name,
      p_emergency_contact_phone: intent.emergency_contact_phone,
      p_consent_given: !!intent.consent_given,
      p_waiver_accepted: !!intent.waiver_accepted
    };

    let registrationId = null;
    const rpcResult = await supabaseRpc('register_for_session', registrationPayload);
    if (rpcResult?.success) {
      registrationId = rpcResult.registration_id || null;
    } else if (String(rpcResult?.message || '').toLowerCase().includes('already registered')) {
      const existing = await supabaseRequest(`/registrations?session_id=eq.${encodeURIComponent(intent.session_id)}&email=eq.${encodeURIComponent(normalizeEmail(intent.email))}&attendance_status=neq.cancelled&select=id`);
      registrationId = Array.isArray(existing) && existing[0] ? String(existing[0].id) : null;
    } else {
      await supabaseRequest(`/payment_intents?reference_id=eq.${encodeURIComponent(referenceId)}`, {
        method: 'PATCH',
        body: {
          status: 'paid_booking_failed',
          payrexx_transaction_id: String(verifiedTransaction.id || transactionId),
          payment_method: verifiedTransaction.psp || intent.payment_method || null
        }
      });
      throw new Error(rpcResult?.message || 'Booking could not be finalized after payment.');
    }

    try {
      await syncSessionRegisteredCount(intent.session_id);
    } catch (countError) {
      console.error('Booking finalization session count warning:', countError);
    }

    const participantDetails = {
      fullName: intent.full_name,
      email: intent.email,
      phone: intent.phone,
      age: intent.age,
      gender: intent.gender,
      foodAllergies: intent.food_allergies,
      medicalConditions: intent.medical_conditions,
      emergencyContactName: intent.emergency_contact_name,
      emergencyContactPhone: intent.emergency_contact_phone
    };
    const eventDetails = {
      title: intent.event_title,
      date: intent.event_date,
      location: intent.event_location
    };
    const sessionDetails = {
      title: intent.session_title,
      startTime: intent.session_start_time,
      endTime: intent.session_end_time,
      exerciseType: intent.session_exercise_type,
      priceChf: intent.amount_chf
    };
    const registrationLanguage = intent.language === 'en' ? 'en' : 'it';

    let emailSent = !!intent.email_sent;
    if (!emailSent) {
      try {
        await sendRegistrationEmail({
          participant: participantDetails,
          eventData: eventDetails,
          session: sessionDetails,
          language: registrationLanguage
        });
        emailSent = true;
      } catch (emailError) {
        console.error('Payment webhook participant email error:', emailError);
      }
    }

    let adminEmailSent = false;
    try {
      await sendAdminPaymentEmail({
        participant: participantDetails,
        eventData: eventDetails,
        session: sessionDetails,
        payment: {
          amountChf: intent.amount_chf,
          method: verifiedTransaction.psp || intent.payment_method || '',
          referenceId,
          transactionId: String(verifiedTransaction.id || transactionId)
        }
      });
      adminEmailSent = true;
    } catch (adminEmailError) {
      console.error('Payment webhook admin email error:', adminEmailError);
    }

    await supabaseRequest(`/payment_intents?reference_id=eq.${encodeURIComponent(referenceId)}`, {
      method: 'PATCH',
      body: {
        status: 'confirmed',
        payrexx_transaction_id: String(verifiedTransaction.id || transactionId),
        payment_method: verifiedTransaction.psp || intent.payment_method || null,
        registration_id: registrationId,
        email_sent: emailSent
      }
    });

    console.log('Payrexx webhook finalized booking', { referenceId, registrationId, emailSent, adminEmailSent });

    return jsonResponse(200, {
      success: true,
      processed: true,
      registrationId,
      emailSent,
      adminEmailSent
    });
  } catch (error) {
    console.error('Payrexx webhook error:', error);
    return jsonResponse(500, { success: false, message: error.message || 'Webhook processing failed.' });
  }
};
