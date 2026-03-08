// force fresh deploy for base price fix
const CONFIG = {
  SUPABASE_URL: 'https://xqmwipogfcfjmqsiqdbu.supabase.co',
  SUPABASE_KEY: 'sb_publishable_acr4jKu8IG-THTIn40q3eA_uOiEaOCj'
};

const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let events = [];
let editingEventId = null;
let sessionForms = [];
let currentAdminUser = null;
let registrations = [];

async function isCurrentUserAdmin(user) {
  if (!user?.id) return false;

  const { data, error } = await supabaseClient
    .from('admin_users')
    .select('id, email')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('Admin check failed:', error);
    throw error;
  }

  return !!data;
}

function showLoginError(message) {
  const errorDiv = document.getElementById('loginError');
  if (!errorDiv) return;
  errorDiv.textContent = message;
  errorDiv.classList.add('visible');
}

function clearLoginError() {
  const errorDiv = document.getElementById('loginError');
  if (!errorDiv) return;
  errorDiv.textContent = 'Login failed';
  errorDiv.classList.remove('visible');
}

async function initializeAdminAuth() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    const session = data?.session;
    if (!session?.user) {
      showLoginScreen();
      return;
    }

    const allowed = await isCurrentUserAdmin(session.user);
    if (!allowed) {
      await supabaseClient.auth.signOut();
      showLoginScreen();
      showLoginError('This account is not allowed to use the admin area.');
      return;
    }

    currentAdminUser = session.user;
    showAdminInterface();
    await loadEvents();
    await loadRegistrations();
  } catch (error) {
    console.error('Auth startup failed:', error);
    showLoginScreen();
    showLoginError('Could not check admin access.');
  }
}

async function attemptLogin() {
  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');
  const email = emailInput?.value.trim() || '';
  const password = passwordInput?.value || '';

  clearLoginError();

  if (!email || !password) {
    showLoginError('Enter your admin email and password.');
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const user = data?.user;
    const allowed = await isCurrentUserAdmin(user);

    if (!allowed) {
      await supabaseClient.auth.signOut();
      showLoginError('This account is not allowed to use the admin area.');
      return;
    }

    currentAdminUser = user;
    passwordInput.value = '';
    showAdminInterface();
    await loadEvents();
    await loadRegistrations();
  } catch (error) {
    console.error('Login failed:', error);
    showLoginError(error.message || 'Login failed');
  }
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentAdminUser = null;
  location.reload();
}

function showLoginScreen() {
  document.getElementById('loginScreen')?.classList.remove('hidden');
  document.getElementById('adminInterface').style.display = 'none';
}

function showAdminInterface() {
  document.getElementById('loginScreen')?.classList.add('hidden');
  document.getElementById('adminInterface').style.display = 'block';

  const demoBanner = document.querySelector('.demo-banner');
  if (demoBanner) {
    demoBanner.innerHTML = '<strong>LIVE MODE:</strong> Admin login and event saving now use Supabase.';
  }
}

function mapDatabaseToUi(eventRows, sessionRows) {
  return (eventRows || []).map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    location: event.location,
    description: event.description || '',
    heroPhrase: event.hero_phrase || '',
    basePriceChf: event.base_price_chf || 0,
    sessions: (sessionRows || [])
      .filter((session) => session.event_id === event.id)
      .map((session) => ({
        id: session.id,
        title: session.title,
        startTime: session.start_time,
        endTime: session.end_time,
        exerciseType: session.exercise_type,
        maxParticipants: session.max_participants,
        registered: session.registered_count || 0,
        priceChf: session.price_chf || 0
      }))
  }));
}

async function loadEvents() {
  try {
    const { data: eventRows, error: eventsError } = await supabaseClient
      .from('events')
      .select('*')
      .order('date', { ascending: true });

    if (eventsError) throw eventsError;

    const { data: sessionRows, error: sessionsError } = await supabaseClient
      .from('sessions')
      .select('*')
      .order('start_time', { ascending: true });

    if (sessionsError) throw sessionsError;

    events = mapDatabaseToUi(eventRows, sessionRows);
  } catch (error) {
    console.error('Failed to load events:', error);
    events = [];
    showToast('Failed to load events from Supabase.', 'error');
  }

  renderEvents();
  updateStats();
}

async function loadRegistrations() {
  try {
    const { data, error } = await supabaseClient
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    registrations = data || [];
  } catch (error) {
    console.error('Failed to load registrations:', error);
    registrations = [];
    showToast('Failed to load registrations from Supabase.', 'error');
  }

  renderRegistrations();
  updateStats();
}

function renderRegistrations() {
  const container = document.getElementById('registrationsList');
  if (!container) return;

  if (!registrations.length) {
    container.innerHTML = '<div class="empty-state"><p>No registrations yet.</p></div>';
    return;
  }

  container.innerHTML = registrations.map((registration) => {
    let matchedEvent = null;
    let matchedSession = null;

    for (const event of events) {
      const session = (event.sessions || []).find((s) => s.id === registration.session_id);
      if (session) {
        matchedEvent = event;
        matchedSession = session;
        break;
      }
    }

    return `
      <div class="event-item">
        <div class="event-header">
          <div class="event-info">
            <h3>${escapeHtml(registration.full_name || 'No name')}</h3>

            <div class="event-meta">
              ${escapeHtml(registration.email || 'No email')}
              ${registration.phone ? ` · ${escapeHtml(registration.phone)}` : ''}
            </div>

            <div class="event-meta" style="margin-top:4px;">
              ${matchedEvent ? `Event: ${escapeHtml(matchedEvent.title)}` : 'Event: Unknown'}
              ${matchedSession ? ` · Session: ${escapeHtml(matchedSession.title)} (${escapeHtml(matchedSession.startTime)} - ${escapeHtml(matchedSession.endTime)})` : ''}
            </div>

            <div class="event-meta" style="margin-top:4px;">
              ${registration.age ? `Age: ${escapeHtml(String(registration.age))}` : 'Age: —'}
              ${registration.emergency_contact_name ? ` · Emergency Contact: ${escapeHtml(registration.emergency_contact_name)}` : ''}
              ${registration.emergency_contact_phone ? ` (${escapeHtml(registration.emergency_contact_phone)})` : ''}
            </div>

            <div class="event-meta" style="margin-top:4px;">
              Food allergies: ${registration.food_allergies ? escapeHtml(registration.food_allergies) : '—'}
            </div>

            <div class="event-meta" style="margin-top:4px;">
              Medical / physical conditions: ${registration.medical_conditions ? escapeHtml(registration.medical_conditions) : '—'}
            </div>

            <div class="event-meta" style="margin-top:4px;">
              ${registration.created_at ? new Date(registration.created_at).toLocaleString() : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function saveButtonLoading(isLoading) {
  const submitBtn = document.getElementById('submitBtn');
  if (!submitBtn) return;

  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading
    ? (editingEventId ? 'Saving...' : 'Creating...')
    : (editingEventId ? 'Update Event' : 'Create Event');
}

async function saveEventToSupabase(eventData) {
  const eventRow = {
    id: eventData.id,
    title: eventData.title,
    date: eventData.date,
    location: eventData.location,
    description: eventData.description,
    hero_phrase: eventData.heroPhrase,
    base_price_chf: eventData.basePriceChf
  };

  if (editingEventId) {
    const { error: eventError } = await supabaseClient
      .from('events')
      .update(eventRow)
      .eq('id', editingEventId);

    if (eventError) throw eventError;
  } else {
    const { error: eventError } = await supabaseClient
      .from('events')
      .insert(eventRow);

    if (eventError) throw eventError;
  }

  const sessionRows = eventData.sessions.map((session) => ({
    id: session.id,
    event_id: eventData.id,
    title: session.title,
    start_time: session.startTime,
    end_time: session.endTime,
    exercise_type: session.exerciseType,
    max_participants: session.maxParticipants,
    registered_count: session.registered,
    price_chf: session.priceChf || 0
  }));

  if (editingEventId) {
    const existingEvent = events.find((event) => event.id === editingEventId);
    const oldSessionIds = (existingEvent?.sessions || []).map((session) => session.id);
    const newSessionIds = sessionRows.map((session) => session.id);
    const sessionIdsToDelete = oldSessionIds.filter((id) => !newSessionIds.includes(id));

    if (sessionIdsToDelete.length) {
      const { error: deleteSessionsError } = await supabaseClient
        .from('sessions')
        .delete()
        .in('id', sessionIdsToDelete);

      if (deleteSessionsError) throw deleteSessionsError;
    }

    if (sessionRows.length) {
      const { error: upsertSessionsError } = await supabaseClient
        .from('sessions')
        .upsert(sessionRows, { onConflict: 'id' });

      if (upsertSessionsError) throw upsertSessionsError;
    }
  } else {
    if (sessionRows.length) {
      const { error: insertSessionsError } = await supabaseClient
        .from('sessions')
        .insert(sessionRows);

      if (insertSessionsError) throw insertSessionsError;
    }
  }
}

async function deleteEventFromSupabase(eventId) {
  const sessionIds = (events.find((event) => event.id === eventId)?.sessions || []).map((session) => session.id);

  if (sessionIds.length) {
    const { error: deleteSessionsError } = await supabaseClient
      .from('sessions')
      .delete()
      .in('id', sessionIds);

    if (deleteSessionsError) throw deleteSessionsError;
  }

  const { error: deleteEventError } = await supabaseClient
    .from('events')
    .delete()
    .eq('id', eventId);

  if (deleteEventError) throw deleteEventError;
}

function renderEvents() {
  const container = document.getElementById('eventsList');
  if (!container) return;

  if (!events.length) {
    container.innerHTML = '<div class="empty-state"><p>No events yet. Create your first event to get started.</p></div>';
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

  container.innerHTML = sorted.map((event) => {
    const isPast = new Date(event.date) < today;
    const totalSpots = event.sessions.reduce((sum, s) => sum + s.maxParticipants, 0);
    const totalRegistered = event.sessions.reduce((sum, s) => sum + (s.registered || 0), 0);

    return `
      <div class="event-item">
        <div class="event-header" onclick="toggleEvent('${escapeJs(event.id)}')">
          <div class="event-info">
            <h3>${escapeHtml(event.title)} ${isPast ? '<span style="color:var(--text-muted);font-size:.8rem;">(Past)</span>' : ''}</h3>
            <div class="event-meta">${formatDate(event.date)} · ${escapeHtml(event.location)} · ${totalRegistered}/${totalSpots} registered</div>
          </div>
          <div class="event-actions" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm" onclick="editEvent('${escapeJs(event.id)}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteEvent('${escapeJs(event.id)}')">Delete</button>
          </div>
        </div>
        <div class="event-sessions-preview" id="sessions-${escapeAttr(event.id)}" style="display:none;">
          ${event.sessions.map((session) => `<span class="session-tag ${session.registered >= session.maxParticipants ? 'full' : ''}"><span class="time">${escapeHtml(session.startTime)}</span>${escapeHtml(session.title)} <span class="capacity">(${session.registered}/${session.maxParticipants})</span></span>`).join('')}
        </div>
      </div>`;
  }).join('');
}

function toggleEvent(eventId) {
  const el = document.getElementById(`sessions-${eventId}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function updateStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  document.getElementById('totalEvents').textContent = events.length;
  document.getElementById('upcomingEvents').textContent = events.filter((e) => new Date(e.date) >= today).length;
  document.getElementById('totalSessions').textContent = events.reduce((sum, e) => sum + e.sessions.length, 0);
  document.getElementById('totalRegistrations').textContent = registrations.length;
}

function initForm() {
  document.getElementById('eventForm')?.addEventListener('submit', handleSubmit);
}

function addSessionForm(sessionData = null) {
  const index = sessionForms.length;
  const container = document.getElementById('sessionsContainer');
  const div = document.createElement('div');
  div.className = 'session-form';
  div.dataset.sessionId = sessionData?.id || '';
  div.innerHTML = `
    <div class="session-form-header">
      <span>Session ${index + 1}</span>
      ${index > 0 ? `<button type="button" class="btn-remove-session" onclick="removeSessionForm(${index})">×</button>` : ''}
    </div>
    <div class="form-row">
      <div class="form-group"><label>Session Title *</label><input type="text" class="session-title" required value="${escapeAttr(sessionData?.title || '')}"></div>
      <div class="form-group"><label>Exercise Type *</label><input type="text" class="session-type" required value="${escapeAttr(sessionData?.exerciseType || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Start Time *</label><input type="time" class="session-start" required value="${escapeAttr(sessionData?.startTime || '09:00')}"></div>
      <div class="form-group"><label>End Time *</label><input type="time" class="session-end" required value="${escapeAttr(sessionData?.endTime || '10:30')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Max Participants *</label><input type="number" class="session-max" min="1" max="500" required value="${sessionData?.maxParticipants || 50}"></div>
      <div class="form-group"><label>Already Registered</label><input type="number" class="session-registered" min="0" value="${sessionData?.registered || 0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Session Price (CHF)</label><input type="number" class="session-price" min="0" step="0.01" value="${sessionData?.priceChf ?? 0}"></div>
    </div>`;
  container.appendChild(div);
  sessionForms.push(div);
}

function removeSessionForm(index) {
  if (sessionForms.length <= 1) {
    showToast('Event must have at least one session.', 'error');
    return;
  }

  sessionForms[index].remove();
  sessionForms.splice(index, 1);

  sessionForms.forEach((form, i) => {
    form.querySelector('.session-form-header span').textContent = `Session ${i + 1}`;
    const btn = form.querySelector('.btn-remove-session');
    if (btn) btn.onclick = () => removeSessionForm(i);
  });
}

async function handleSubmit(e) {
  e.preventDefault();
  if (!validateForm()) return;

  const eventId = editingEventId || generateId();
  const existingEvent = events.find((event) => event.id === editingEventId);

  const eventData = {
    id: eventId,
    title: document.getElementById('eventTitle').value.trim(),
    date: document.getElementById('eventDate').value,
    location: document.getElementById('eventLocation').value.trim(),
    description: document.getElementById('eventDescription').value.trim(),
    heroPhrase: document.getElementById('heroPhrase').value.trim(),
    basePriceChf: parseFloat(document.getElementById('basePriceChf').value) || 0,
    sessions: gatherSessionsData(eventId, existingEvent)
  };

  try {
    saveButtonLoading(true);
    await saveEventToSupabase(eventData);
    await loadEvents();
    resetForm();
    showToast(editingEventId ? 'Event updated successfully.' : 'Event created successfully.', 'success');
  } catch (error) {
    console.error('Save failed:', error);
    showToast(error.message || 'Could not save event to Supabase.', 'error');
  } finally {
    saveButtonLoading(false);
  }
}

function validateForm() {
  let valid = true;
  document.querySelectorAll('.error').forEach((el) => el.classList.remove('error'));
  document.querySelectorAll('.error-message.visible').forEach((el) => el.classList.remove('visible'));

  ['eventTitle', 'eventDate', 'eventLocation'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el.value.trim()) {
      valid = false;
      el.classList.add('error');
      el.nextElementSibling?.classList.add('visible');
    }
  });

  sessionForms.forEach((form, i) => {
    const title = form.querySelector('.session-title');
    const type = form.querySelector('.session-type');
    const start = form.querySelector('.session-start');
    const end = form.querySelector('.session-end');
    const max = form.querySelector('.session-max');
    const reg = form.querySelector('.session-registered');

    if (!title.value.trim() || !type.value.trim() || !start.value || !end.value || !max.value) {
      valid = false;
      showToast(`Please fill all required fields for Session ${i + 1}.`, 'error');
    }

    if (start.value >= end.value) {
      valid = false;
      end.classList.add('error');
      showToast(`Session ${i + 1}: end time must be after start time.`, 'error');
    }

    const maxVal = parseInt(max.value, 10) || 0;
    const regVal = parseInt(reg.value, 10) || 0;

    if (maxVal < 1 || maxVal > 500) {
      valid = false;
      max.classList.add('error');
      showToast(`Session ${i + 1}: max participants must be 1-500.`, 'error');
    }

    if (regVal > maxVal) {
      valid = false;
      reg.classList.add('error');
      showToast(`Session ${i + 1}: registered cannot exceed max.`, 'error');
    }
  });

  return valid;
}

function gatherSessionsData(eventId, existingEvent = null) {
  const existingSessions = existingEvent?.sessions || [];

  return sessionForms.map((form, index) => {
    const max = Math.max(1, Math.min(500, parseInt(form.querySelector('.session-max').value, 10) || 50));
    const reg = Math.max(0, Math.min(max, parseInt(form.querySelector('.session-registered').value, 10) || 0));

    return {
      id: form.dataset.sessionId || existingSessions[index]?.id || `${eventId}-session-${Date.now()}-${index}`,
      title: form.querySelector('.session-title').value.trim(),
      exerciseType: form.querySelector('.session-type').value.trim(),
      startTime: form.querySelector('.session-start').value,
      endTime: form.querySelector('.session-end').value,
      maxParticipants: max,
      registered: reg,
      priceChf: parseFloat(form.querySelector('.session-price')?.value) || 0
    };
  });
}

function editEvent(eventId) {
  const event = events.find((e) => e.id === eventId);
  if (!event) return;

  editingEventId = eventId;
  document.getElementById('formTitle').textContent = 'Edit Event';
  document.getElementById('submitBtn').textContent = 'Update Event';
  document.getElementById('eventId').value = event.id;
  document.getElementById('eventTitle').value = event.title || '';
  document.getElementById('eventDate').value = event.date || '';
  document.getElementById('eventLocation').value = event.location || '';
  document.getElementById('eventDescription').value = event.description || '';
  document.getElementById('heroPhrase').value = event.heroPhrase || '';
  document.getElementById('basePriceChf').value = event.basePriceChf ?? 0;
  document.getElementById('sessionsContainer').innerHTML = '';
  sessionForms = [];
  (event.sessions?.length ? event.sessions : [{}]).forEach((session) => addSessionForm(session));
  document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' });
}

async function deleteEvent(eventId) {
  if (!confirm('Are you sure you want to delete this event?')) return;

  try {
    await deleteEventFromSupabase(eventId);
    await loadEvents();

    if (editingEventId === eventId) {
      resetForm();
    }

    showToast('Event deleted.', 'success');
  } catch (error) {
    console.error('Delete failed:', error);
    showToast(error.message || 'Could not delete event.', 'error');
  }
}

function resetForm() {
  editingEventId = null;
  document.getElementById('eventForm').reset();
  document.getElementById('formTitle').textContent = 'Create Event';
  document.getElementById('submitBtn').textContent = 'Create Event';
  document.getElementById('sessionsContainer').innerHTML = '';
  sessionForms = [];
  addSessionForm();
}

function generateId() {
  return `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttr(text) {
  return escapeHtml(String(text ?? '')).replace(/"/g, '&quot;');
}

function escapeJs(text) {
  return String(text ?? '').replace(/['\\]/g, '\\$&');
}

function exportData() {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitness-truck-events-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Events exported to JSON.', 'success');
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-size:1.2rem;">${type === 'success' ? '✓' : '!'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

document.addEventListener('DOMContentLoaded', async () => {
  initForm();
  addSessionForm();

  const emailInput = document.getElementById('adminEmail');
  const passwordInput = document.getElementById('adminPassword');

  emailInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });

  passwordInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });

  await initializeAdminAuth();
});

window.attemptLogin = attemptLogin;
window.logout = logout;
window.toggleEvent = toggleEvent;
window.editEvent = editEvent;
window.deleteEvent = deleteEvent;
window.addSessionForm = addSessionForm;
window.removeSessionForm = removeSessionForm;
window.resetForm = resetForm;
window.exportData = exportData;
