// admin attendance tracking update
const CONFIG = {
  SUPABASE_URL: 'https://xqmwipogfcfjmqsiqdbu.supabase.co',
  SUPABASE_KEY: 'sb_publishable_acr4jKu8IG-THTIn40q3eA_uOiEaOCj',
  EVENT_MEDIA_BUCKET: 'event-media'
};

const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

let events = [];
let editingEventId = null;
let sessionForms = [];
let currentAdminUser = null;
let registrations = [];
let registrationSearchTerm = '';
let isSyncingSessionCounts = false;
let pendingEventPhotoFile = null;
let pendingEventPhotoPreviewUrl = '';
let pendingRemoveEventPhoto = false;

const REGISTRATION_STATUS_LABELS = {
  registered: 'Registered',
  attended: 'Attended',
  cancelled: 'Cancelled',
  no_show: 'No-show'
};

function normalizeRegistrationStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return REGISTRATION_STATUS_LABELS[value] ? value : 'registered';
}

function formatRegistrationStatusLabel(status) {
  return REGISTRATION_STATUS_LABELS[normalizeRegistrationStatus(status)] || 'Registered';
}

function formatGenderLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male') return 'Male';
  if (normalized === 'female') return 'Female';
  if (normalized === 'other') return 'Other';
  if (normalized === 'prefer_not_to_say') return 'Prefer not to say';
  return value || '';
}

function getEventPhotoUrl(event) {
  return String(event?.photoUrl || event?.photo_url || '').trim();
}

function getEventPhotoPath(event) {
  return String(event?.photoPath || event?.photo_path || '').trim();
}

function getEventLocationMarker(event) {
  return String(event?.location || '').split(/[,·-]/)[0].trim() || 'Ticino';
}

function isSupportedEventImageFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const extension = name.includes('.') ? name.split('.').pop() : '';
  const type = String(file.type || '').toLowerCase();
  const allowedExtensions = ['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'heif'];
  if (type.startsWith('image/')) return true;
  return allowedExtensions.includes(extension);
}

function clearPendingEventPhotoState() {
  if (pendingEventPhotoPreviewUrl) {
    try { URL.revokeObjectURL(pendingEventPhotoPreviewUrl); } catch (error) {}
  }
  pendingEventPhotoFile = null;
  pendingEventPhotoPreviewUrl = '';
  pendingRemoveEventPhoto = false;
  const input = document.getElementById('eventPhotoFile');
  if (input) input.value = '';
}

function getCurrentEventPhotoContext(eventLike = null) {
  if (eventLike) return eventLike;
  if (editingEventId) {
    return events.find((event) => event.id === editingEventId) || { location: document.getElementById('eventLocation')?.value || 'Ticino' };
  }
  return { location: document.getElementById('eventLocation')?.value || 'Ticino' };
}

function renderEventPhotoPreview(eventLike = null) {
  const preview = document.getElementById('eventPhotoPreview');
  const meta = document.getElementById('eventPhotoMeta');
  if (!preview || !meta) return;

  const context = getCurrentEventPhotoContext(eventLike);
  const locationLabel = getEventLocationMarker(context);
  const activePhotoUrl = pendingRemoveEventPhoto ? '' : (pendingEventPhotoPreviewUrl || getEventPhotoUrl(context));

  if (activePhotoUrl) {
    preview.style.backgroundImage = `linear-gradient(180deg, rgba(8,8,8,0.12) 0%, rgba(8,8,8,0.58) 100%), url("${activePhotoUrl}")`;
    preview.innerHTML = `<span>${escapeHtml(locationLabel)}</span>`;
    meta.textContent = pendingEventPhotoFile ? `Selected: ${pendingEventPhotoFile.name}` : 'This dedicated photo will be shown on the homepage event card and next-event panel.';
  } else {
    preview.style.backgroundImage = '';
    preview.innerHTML = `<span>${escapeHtml(locationLabel)}</span>`;
    meta.textContent = pendingRemoveEventPhoto ? 'Using the location fallback until a new photo is uploaded.' : 'Upload a dedicated photo for this event card. If empty, the site will show a clean location fallback.';
  }
}

function bindEventPhotoControls(eventLike = null) {
  const input = document.getElementById('eventPhotoFile');
  const removeButton = document.getElementById('removeEventPhotoBtn');
  if (input && !input.dataset.bound) {
    input.dataset.bound = '1';
    input.addEventListener('change', () => {
      const [file] = Array.from(input.files || []);
      if (!file) return;
      if (!isSupportedEventImageFile(file)) {
        showToast('Please choose a supported image file.', 'error');
        input.value = '';
        return;
      }
      pendingEventPhotoFile = file;
      pendingEventPhotoPreviewUrl = URL.createObjectURL(file);
      pendingRemoveEventPhoto = false;
      renderEventPhotoPreview();
    });
  }
  if (removeButton && !removeButton.dataset.bound) {
    removeButton.dataset.bound = '1';
    removeButton.addEventListener('click', () => {
      if (pendingEventPhotoPreviewUrl) {
        try { URL.revokeObjectURL(pendingEventPhotoPreviewUrl); } catch (error) {}
      }
      pendingEventPhotoPreviewUrl = '';
      pendingEventPhotoFile = null;
      pendingRemoveEventPhoto = true;
      if (input) input.value = '';
      renderEventPhotoPreview();
    });
  }
  renderEventPhotoPreview(eventLike);
}

async function uploadEventPhotoIfNeeded(eventData, existingEvent = null) {
  const existingPhotoPath = getEventPhotoPath(existingEvent);
  let photoUrl = getEventPhotoUrl(existingEvent);
  let photoPath = existingPhotoPath;

  if (pendingRemoveEventPhoto && existingPhotoPath) {
    await supabaseClient.storage.from(CONFIG.EVENT_MEDIA_BUCKET).remove([existingPhotoPath]);
    photoUrl = '';
    photoPath = '';
  } else if (pendingRemoveEventPhoto) {
    photoUrl = '';
    photoPath = '';
  }

  if (pendingEventPhotoFile) {
    const extension = String(pendingEventPhotoFile.name || 'jpg').split('.').pop().toLowerCase() || 'jpg';
    const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'jpg';
    const filePath = `events/${eventData.id}-${Date.now()}.${safeExtension}`;
    const { error: uploadError } = await supabaseClient.storage
      .from(CONFIG.EVENT_MEDIA_BUCKET)
      .upload(filePath, pendingEventPhotoFile, {
        cacheControl: '3600',
        upsert: true,
        contentType: pendingEventPhotoFile.type || 'image/jpeg'
      });

    if (uploadError) throw uploadError;

    if (existingPhotoPath && existingPhotoPath !== filePath) {
      await supabaseClient.storage.from(CONFIG.EVENT_MEDIA_BUCKET).remove([existingPhotoPath]);
    }

    const { data } = supabaseClient.storage.from(CONFIG.EVENT_MEDIA_BUCKET).getPublicUrl(filePath);
    photoUrl = String(data?.publicUrl || '');
    photoPath = filePath;
  }

  eventData.photoUrl = photoUrl;
  eventData.photoPath = photoPath;
}

function isSeatCountingStatus(status) {
  return normalizeRegistrationStatus(status) !== 'cancelled';
}

function getRegistrationStatusBadgeStyles(status) {
  switch (normalizeRegistrationStatus(status)) {
    case 'attended':
      return 'background:rgba(34,197,94,0.14);color:#166534;border:1px solid rgba(34,197,94,0.28);';
    case 'cancelled':
      return 'background:rgba(239,68,68,0.12);color:#991b1b;border:1px solid rgba(239,68,68,0.22);';
    case 'no_show':
      return 'background:rgba(245,158,11,0.14);color:#92400e;border:1px solid rgba(245,158,11,0.28);';
    default:
      return 'background:rgba(59,130,246,0.12);color:#1d4ed8;border:1px solid rgba(59,130,246,0.22);';
  }
}

function getRegistrationStatusSelectId(registrationId) {
  return `registration-status-${String(registrationId || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

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

function normalizeMealType(value) {
  const normalized = String(value || 'none').trim().toLowerCase();
  return ['breakfast', 'lunch', 'supper'].includes(normalized) ? normalized : 'none';
}

function getMealLabel(mealType) {
  switch (normalizeMealType(mealType)) {
    case 'breakfast':
      return 'Breakfast included';
    case 'lunch':
      return 'Lunch included';
    case 'supper':
      return 'Supper included';
    default:
      return '';
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
    mealType: normalizeMealType(event.meal_type),
    photoUrl: event.photo_url || '',
    photoPath: event.photo_path || '',
    registrationOpen: event.registration_open !== false,
    sessions: (sessionRows || [])
      .filter((session) => session.event_id === event.id)
      .map((session) => ({
        id: session.id,
        title: session.title,
        startTime: session.start_time,
        endTime: session.end_time,
        exerciseType: session.exercise_type,
        maxParticipants: session.max_participants,
        storedRegisteredCount: session.registered_count || 0,
        registered: session.registered_count || 0,
        priceChf: session.price_chf || 0,
        registrationOpen: session.registration_open !== false
      }))
  }));
}

function isEventRegistrationOpen(event) {
  return event?.registrationOpen !== false;
}

function isSessionRegistrationOpen(session) {
  return session?.registrationOpen !== false;
}

function getRegistrationToggleBadge(isOpen) {
  return `<span class="admin-reg-badge ${isOpen ? 'open' : 'closed'}">${isOpen ? 'Open' : 'Closed'}</span>`;
}

function buildLiveRegistrationCountMap() {
  const countMap = new Map();

  registrations.forEach((registration) => {
    if (!registration?.session_id) return;
    if (!isSeatCountingStatus(registration.attendance_status)) return;
    countMap.set(registration.session_id, (countMap.get(registration.session_id) || 0) + 1);
  });

  return countMap;
}

function applyLiveRegistrationCounts() {
  const countMap = buildLiveRegistrationCountMap();

  events.forEach((event) => {
    (event.sessions || []).forEach((session) => {
      session.registered = countMap.get(session.id) || 0;
    });
  });
}

async function syncStoredSessionCountsToSupabase() {
  if (isSyncingSessionCounts) return;

  const updates = [];

  events.forEach((event) => {
    (event.sessions || []).forEach((session) => {
      const liveCount = Number(session.registered || 0);
      const storedCount = Number(session.storedRegisteredCount || 0);

      if (liveCount !== storedCount) {
        updates.push({
          id: session.id,
          registered_count: liveCount
        });
      }
    });
  });

  if (!updates.length) return;

  isSyncingSessionCounts = true;

  try {
    await Promise.all(
      updates.map((update) => (
        supabaseClient
          .from('sessions')
          .update({ registered_count: update.registered_count })
          .eq('id', update.id)
      ))
    );

    events.forEach((event) => {
      (event.sessions || []).forEach((session) => {
        session.storedRegisteredCount = session.registered;
      });
    });
  } catch (error) {
    console.error('Could not sync session counts back to Supabase:', error);
  } finally {
    isSyncingSessionCounts = false;
  }
}

function refreshAdminDataView() {
  applyLiveRegistrationCounts();
  renderEvents();
  renderRegistrations();
  updateStats();
  refreshEditingSessionFormLiveCounts();
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

  refreshAdminDataView();
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

  refreshAdminDataView();
  await syncStoredSessionCountsToSupabase();
}

function getRegistrationMatchDetails(registration) {
  let matchedEvent = null;
  let matchedSession = null;

  for (const event of events) {
    const session = (event.sessions || []).find((item) => item.id === registration.session_id);
    if (session) {
      matchedEvent = event;
      matchedSession = session;
      break;
    }
  }

  return { matchedEvent, matchedSession };
}

function getEventRegistrationStatusCounts(event) {
  const sessionIds = new Set((event?.sessions || []).map((session) => session.id));
  const counts = {
    registered: 0,
    attended: 0,
    cancelled: 0,
    no_show: 0
  };

  registrations.forEach((registration) => {
    if (!sessionIds.has(registration.session_id)) return;
    counts[normalizeRegistrationStatus(registration.attendance_status)] += 1;
  });

  return counts;
}

function getFilteredRegistrations() {
  const term = registrationSearchTerm.trim().toLowerCase();

  if (!term) {
    return registrations;
  }

  return registrations.filter((registration) => {
    const { matchedEvent, matchedSession } = getRegistrationMatchDetails(registration);

    const searchableText = [
      registration.full_name,
      registration.email,
      registration.phone,
      registration.emergency_contact_name,
      registration.emergency_contact_phone,
      registration.gender,
      registration.food_allergies,
      registration.medical_conditions,
      formatRegistrationStatusLabel(registration.attendance_status),
      matchedEvent?.title,
      matchedSession?.title,
      matchedSession?.startTime,
      matchedSession?.endTime
    ].filter(Boolean).join(' ').toLowerCase();

    return searchableText.includes(term);
  });
}


function refreshEditingSessionFormLiveCounts() {
  if (!editingEventId || !sessionForms.length) return;

  const editingEvent = events.find((event) => event.id === editingEventId);
  if (!editingEvent) return;

  sessionForms.forEach((form) => {
    const sessionId = form.dataset.sessionId;
    const countInput = form.querySelector('.session-registered');
    if (!countInput) return;

    if (!sessionId) {
      countInput.value = '0';
      return;
    }

    const matchingSession = (editingEvent.sessions || []).find((session) => session.id === sessionId);
    countInput.value = String(matchingSession?.registered || 0);
  });
}

async function deleteRegistrationFromSupabase(registrationId) {
  if (!registrationId) {
    throw new Error('This registration has no id, so it cannot be deleted.');
  }

  const { error } = await supabaseClient
    .from('registrations')
    .delete()
    .eq('id', registrationId);

  if (error) throw error;
}

async function deleteRegistration(registrationId) {
  const registration = registrations.find((item) => item.id === registrationId);
  const participantName = registration?.full_name || 'this registration';

  if (!confirm(`Delete ${participantName}? This cannot be undone.`)) return;

  try {
    await deleteRegistrationFromSupabase(registrationId);
    await loadRegistrations();
    showToast('Registration deleted.', 'success');
  } catch (error) {
    console.error('Registration delete failed:', error);
    showToast(error.message || 'Could not delete registration.', 'error');
  }
}

async function updateRegistrationStatus(registrationId, nextStatus) {
  const normalizedStatus = normalizeRegistrationStatus(nextStatus);
  const registration = registrations.find((item) => item.id === registrationId);

  if (!registrationId || !registration) {
    showToast('Could not find this registration.', 'error');
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('registrations')
      .update({ attendance_status: normalizedStatus })
      .eq('id', registrationId);

    if (error) throw error;

    registration.attendance_status = normalizedStatus;
    refreshAdminDataView();
    await syncStoredSessionCountsToSupabase();
    showToast(`${registration.full_name || 'Registration'} marked as ${formatRegistrationStatusLabel(normalizedStatus).toLowerCase()}.`, 'success');
  } catch (error) {
    console.error('Registration status update failed:', error);
    showToast(error.message || 'Could not update registration status.', 'error');
  }
}

function saveRegistrationStatus(registrationId) {
  const select = document.getElementById(getRegistrationStatusSelectId(registrationId));
  if (!select) {
    showToast('Status selector not found.', 'error');
    return;
  }

  updateRegistrationStatus(registrationId, select.value);
}

function updateRegistrationsSearchSummary(visibleCount, totalCount) {
  const summary = document.getElementById('registrationsSearchSummary');
  if (!summary) return;

  if (!totalCount) {
    summary.textContent = '';
    return;
  }

  if (!registrationSearchTerm.trim()) {
    summary.textContent = `Showing all ${totalCount} registration${totalCount === 1 ? '' : 's'}.`;
    return;
  }

  summary.textContent = `Showing ${visibleCount} of ${totalCount} registration${totalCount === 1 ? '' : 's'} for “${registrationSearchTerm.trim()}”.`;
}

function renderRegistrations() {
  const container = document.getElementById('registrationsList');
  if (!container) return;

  if (!registrations.length) {
    container.innerHTML = '<div class="empty-state"><p>No registrations yet.</p></div>';
    updateRegistrationsSearchSummary(0, 0);
    return;
  }

  const filteredRegistrations = getFilteredRegistrations();
  updateRegistrationsSearchSummary(filteredRegistrations.length, registrations.length);

  if (!filteredRegistrations.length) {
    container.innerHTML = '<div class="empty-state"><p>No registrations match your search.</p></div>';
    return;
  }

  container.innerHTML = filteredRegistrations.map((registration) => {
    const { matchedEvent, matchedSession } = getRegistrationMatchDetails(registration);
    const normalizedStatus = normalizeRegistrationStatus(registration.attendance_status);
    const statusLabel = formatRegistrationStatusLabel(normalizedStatus);
    const statusSelectId = getRegistrationStatusSelectId(registration.id || '');

    return `
      <div class="event-item">
        <div class="event-header" style="align-items:flex-start; gap:16px;">
          <div class="event-info">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <h3 style="margin:0;">${escapeHtml(registration.full_name || 'No name')}</h3>
              <span style="display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;font-size:0.82rem;font-weight:600;${getRegistrationStatusBadgeStyles(normalizedStatus)}">${escapeHtml(statusLabel)}</span>
              <span style="font-size:0.82rem;opacity:0.72;">${registration.user_id ? 'Linked account' : 'Guest booking'}</span>
            </div>

            <div class="event-meta" style="margin-top:8px;">
              ${escapeHtml(registration.email || 'No email')}
              ${registration.phone ? ` · ${escapeHtml(registration.phone)}` : ''}
            </div>

            <div class="event-meta" style="margin-top:4px;">
              ${matchedEvent ? `Event: ${escapeHtml(matchedEvent.title)}` : 'Event: Unknown'}
              ${matchedSession ? ` · Session: ${escapeHtml(matchedSession.title)} (${escapeHtml(matchedSession.startTime)} - ${escapeHtml(matchedSession.endTime)})` : ''}
            </div>

            <div class="event-meta" style="margin-top:4px;">
              ${registration.age ? `Age: ${escapeHtml(String(registration.age))}` : 'Age: —'}
              ${registration.gender ? ` · Gender: ${escapeHtml(formatGenderLabel(registration.gender))}` : ''}
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
              ${registration.created_at ? `Booked: ${new Date(registration.created_at).toLocaleString()}` : ''}
            </div>
          </div>
          <div class="event-actions" style="flex-shrink:0;min-width:210px;display:flex;flex-direction:column;gap:8px;align-items:stretch;">
            <label for="${escapeAttr(statusSelectId)}" style="font-size:0.82rem;font-weight:600;opacity:0.78;">Attendance status</label>
            <select id="${escapeAttr(statusSelectId)}" style="padding:10px 12px;border-radius:12px;border:1px solid rgba(15,23,42,0.14);background:#fff;">
              ${Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => `<option value="${escapeAttr(value)}" ${normalizedStatus === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
            <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" onclick="saveRegistrationStatus('${escapeJs(registration.id || '')}')">Update</button>
              <button class="btn btn-danger btn-sm" onclick="deleteRegistration('${escapeJs(registration.id || '')}')">Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function handleRegistrationSearch() {
  const input = document.getElementById('registrationSearch');
  registrationSearchTerm = input?.value || '';
  renderRegistrations();
}

function clearRegistrationSearch() {
  const input = document.getElementById('registrationSearch');
  if (input) {
    input.value = '';
  }

  registrationSearchTerm = '';
  renderRegistrations();
}

function saveButtonLoading(isLoading) {
  const submitBtn = document.getElementById('submitBtn');
  if (!submitBtn) return;

  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading
    ? (editingEventId ? 'Saving...' : 'Creating...')
    : (editingEventId ? 'Update Event' : 'Create Event');
}

function withMealSchemaHint(error) {
  const message = String(error?.message || '');
  if (message.includes('meal_type')) {
    error.message = 'The new meal field is not in Supabase yet. Run SUPABASE-add-meal-type-to-events.sql once, then try again.';
  }
  return error;
}

async function saveEventToSupabase(eventData) {
  const eventRow = {
    id: eventData.id,
    title: eventData.title,
    date: eventData.date,
    location: eventData.location,
    description: eventData.description,
    hero_phrase: eventData.heroPhrase,
    base_price_chf: eventData.basePriceChf,
    meal_type: normalizeMealType(eventData.mealType),
    photo_url: eventData.photoUrl || '',
    photo_path: eventData.photoPath || '',
    registration_open: !!eventData.registrationOpen
  };

  if (editingEventId) {
    const { error: eventError } = await supabaseClient
      .from('events')
      .update(eventRow)
      .eq('id', editingEventId);

    if (eventError) throw withMealSchemaHint(eventError);
  } else {
    const { error: eventError } = await supabaseClient
      .from('events')
      .insert(eventRow);

    if (eventError) throw withMealSchemaHint(eventError);
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
    price_chf: session.priceChf || 0,
    registration_open: !!session.registrationOpen
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
  const existingEvent = events.find((event) => event.id === eventId);
  const sessionIds = (existingEvent?.sessions || []).map((session) => session.id);

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

  const existingPhotoPath = getEventPhotoPath(existingEvent);
  if (existingPhotoPath) {
    await supabaseClient.storage.from(CONFIG.EVENT_MEDIA_BUCKET).remove([existingPhotoPath]);
  }
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
    const totalSpots = event.sessions.reduce((sum, session) => sum + session.maxParticipants, 0);
    const totalRegistered = event.sessions.reduce((sum, session) => sum + (session.registered || 0), 0);
    const statusCounts = getEventRegistrationStatusCounts(event);
    const openSessions = event.sessions.filter((session) => isSessionRegistrationOpen(session)).length;

    return `
      <div class="event-item">
        <div class="event-header" onclick="toggleEvent('${escapeJs(event.id)}')">
          <div class="admin-event-header-media">
            <div class="admin-event-thumb ${getEventPhotoUrl(event) ? '' : 'admin-event-thumb--fallback'}" ${getEventPhotoUrl(event) ? `style="background-image:url('${escapeAttr(getEventPhotoUrl(event))}')"` : ''}>${getEventPhotoUrl(event) ? '' : escapeHtml(getEventLocationMarker(event))}</div>
            <div class="event-info">
              <div class="admin-event-title-row">
                <h3>${escapeHtml(event.title)} ${isPast ? '<span style="color:var(--text-muted);font-size:.8rem;">(Past)</span>' : ''}</h3>
                ${getRegistrationToggleBadge(isEventRegistrationOpen(event))}
              </div>
              <div class="event-meta">${formatDate(event.date)} · ${escapeHtml(event.location)} · ${totalRegistered}/${totalSpots} active</div>
              <div class="event-meta" style="margin-top:4px;">Open sessions: ${openSessions}/${event.sessions.length} · Attended: ${statusCounts.attended} · No-show: ${statusCounts.no_show} · Cancelled: ${statusCounts.cancelled}</div>
              ${getMealLabel(event.mealType) ? `<div class="event-meta" style="margin-top:4px;">${escapeHtml(getMealLabel(event.mealType))}</div>` : ''}
            </div>
          </div>
          <div class="event-actions" onclick="event.stopPropagation()">
            <button class="btn btn-secondary btn-sm" onclick="setEventRegistrationOpen('${escapeJs(event.id)}', ${isEventRegistrationOpen(event) ? 'false' : 'true'})">${isEventRegistrationOpen(event) ? 'Close event' : 'Open event'}</button>
            <button class="btn btn-secondary btn-sm" onclick="editEvent('${escapeJs(event.id)}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteEvent('${escapeJs(event.id)}')">Delete</button>
          </div>
        </div>
        <div class="event-sessions-preview" id="sessions-${escapeAttr(event.id)}" style="display:none;">
          ${event.sessions.map((session) => `<div class="admin-session-row"><span class="session-tag ${session.registered >= session.maxParticipants ? 'full' : ''}"><span class="time">${escapeHtml(session.startTime)}</span>${escapeHtml(session.title)} <span class="capacity">(${session.registered}/${session.maxParticipants})</span></span><div class="admin-session-actions">${getRegistrationToggleBadge(isSessionRegistrationOpen(session))}<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();setSessionRegistrationOpen('${escapeJs(event.id)}','${escapeJs(session.id)}', ${isSessionRegistrationOpen(session) ? 'false' : 'true'})">${isSessionRegistrationOpen(session) ? 'Close session' : 'Open session'}</button></div></div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

async function setEventRegistrationOpen(eventId, shouldOpen) {
  const event = events.find((item) => item.id === eventId);
  if (!event) return;

  try {
    const updates = [
      supabaseClient
        .from('events')
        .update({ registration_open: shouldOpen })
        .eq('id', eventId)
    ];

    if (Array.isArray(event.sessions) && event.sessions.length) {
      updates.push(
        supabaseClient
          .from('sessions')
          .update({ registration_open: shouldOpen })
          .eq('event_id', eventId)
      );
    }

    const results = await Promise.all(updates);
    const failed = results.find((result) => result?.error);
    if (failed?.error) throw failed.error;

    event.registrationOpen = shouldOpen;
    if (Array.isArray(event.sessions)) {
      event.sessions.forEach((session) => {
        session.registrationOpen = shouldOpen;
      });
    }

    if (editingEventId === eventId) {
      const checkbox = document.getElementById('eventRegistrationOpen');
      if (checkbox) checkbox.checked = shouldOpen;
      sessionForms.forEach((form) => {
        const sessionCheckbox = form?.querySelector('.session-registration-open');
        if (sessionCheckbox) sessionCheckbox.checked = shouldOpen;
      });
    }

    refreshAdminDataView();
    showToast(`Event registration ${shouldOpen ? 'opened' : 'closed'}${Array.isArray(event.sessions) && event.sessions.length ? ' for all sessions' : ''}.`, 'success');
  } catch (error) {
    console.error('Event registration toggle failed:', error);
    showToast(error.message || 'Could not update event registration.', 'error');
  }
}

async function setSessionRegistrationOpen(eventId, sessionId, shouldOpen) {
  const event = events.find((item) => item.id === eventId);
  const session = event?.sessions?.find((item) => item.id === sessionId);
  if (!event || !session) return;

  try {
    const { error } = await supabaseClient
      .from('sessions')
      .update({ registration_open: shouldOpen })
      .eq('id', sessionId);

    if (error) throw error;

    session.registrationOpen = shouldOpen;

    if (editingEventId === eventId) {
      const form = sessionForms.find((item) => item.dataset.sessionId === sessionId);
      const checkbox = form?.querySelector('.session-registration-open');
      if (checkbox) checkbox.checked = shouldOpen;
    }

    refreshAdminDataView();
    showToast(`Session registration ${shouldOpen ? 'opened' : 'closed'}.`, 'success');
  } catch (error) {
    console.error('Session registration toggle failed:', error);
    showToast(error.message || 'Could not update session registration.', 'error');
  }
}

function toggleEvent(eventId) {
  const el = document.getElementById(`sessions-${eventId}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function updateStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const attendedCount = registrations.filter((registration) => normalizeRegistrationStatus(registration.attendance_status) === 'attended').length;

  document.getElementById('totalEvents').textContent = events.length;
  document.getElementById('upcomingEvents').textContent = events.filter((event) => new Date(event.date) >= today).length;
  document.getElementById('totalSessions').textContent = events.reduce((sum, event) => sum + event.sessions.length, 0);
  document.getElementById('totalRegistrations').textContent = registrations.length;
  document.getElementById('attendedRegistrations').textContent = attendedCount;
}

function initForm() {
  document.getElementById('eventForm')?.addEventListener('submit', handleSubmit);
}

function addSessionForm(sessionData = null) {
  const index = sessionForms.length;
  const container = document.getElementById('sessionsContainer');
  const liveRegisteredCount = Number(sessionData?.registered || 0);
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
      <div class="form-group"><label>Live Registrations</label><input type="number" class="session-registered" min="0" readonly value="${liveRegisteredCount}"><small style="display:block;margin-top:6px;opacity:0.75;">Calculated from real registrations</small></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Session Price (CHF)</label><input type="number" class="session-price" min="0" step="0.01" value="${sessionData?.priceChf ?? 0}"></div>
    </div>
    <div class="form-row">
      <div class="form-group form-group-checkbox">
        <label class="checkbox-row admin-checkbox-row"><input type="checkbox" class="session-registration-open" ${sessionData?.registrationOpen ? 'checked' : ''}> <span>Open this session for booking</span></label>
        <small>Leave this off if you want to release the session later.</small>
      </div>
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

  const wasEditing = !!editingEventId;
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
    mealType: normalizeMealType(document.getElementById('eventMealType')?.value),
    registrationOpen: document.getElementById('eventRegistrationOpen')?.checked || false,
    sessions: gatherSessionsData(eventId, existingEvent)
  };

  try {
    saveButtonLoading(true);
    await uploadEventPhotoIfNeeded(eventData, existingEvent);
    await saveEventToSupabase(eventData);
    await loadEvents();
    resetForm();
    showToast(wasEditing ? 'Event updated successfully.' : 'Event created successfully.', 'success');
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
      max.classList.add('error');
      showToast(`Session ${i + 1}: max participants cannot be lower than live registrations.`, 'error');
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
      priceChf: parseFloat(form.querySelector('.session-price')?.value) || 0,
      registrationOpen: form.querySelector('.session-registration-open')?.checked || false
    };
  });
}

function editEvent(eventId) {
  const event = events.find((item) => item.id === eventId);
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
  document.getElementById('eventMealType').value = normalizeMealType(event.mealType);
  document.getElementById('eventRegistrationOpen').checked = !!event.registrationOpen;
  clearPendingEventPhotoState();
  bindEventPhotoControls(event);
  renderEventPhotoPreview(event);
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
  document.getElementById('eventRegistrationOpen').checked = false;
  document.getElementById('eventMealType').value = 'none';
  clearPendingEventPhotoState();
  bindEventPhotoControls({ location: document.getElementById('eventLocation').value || 'Ticino' });
  renderEventPhotoPreview({ location: document.getElementById('eventLocation').value || 'Ticino' });
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
  const registrationSearchInput = document.getElementById('registrationSearch');

  emailInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });

  passwordInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });

  registrationSearchInput?.addEventListener('input', handleRegistrationSearch);
  document.getElementById('eventLocation')?.addEventListener('input', () => {
    if (!editingEventId) renderEventPhotoPreview();
  });
  bindEventPhotoControls();
  renderEventPhotoPreview();

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
window.clearRegistrationSearch = clearRegistrationSearch;
window.deleteRegistration = deleteRegistration;
window.saveRegistrationStatus = saveRegistrationStatus;
