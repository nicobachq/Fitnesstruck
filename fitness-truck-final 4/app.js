// ============================================
// FITNESS TRUCK - Main Application (Supabase + Full Registration)
// ============================================

const CONFIG = {
  DEMO_MODE: false,
  SUPABASE_URL: 'https://xqmwipogfcfjmqsiqdbu.supabase.co',
  SUPABASE_KEY: 'sb_publishable_acr4jKu8IG-THTIn40q3eA_uOiEaOCj',
  AVATAR_BUCKET: 'avatars'
};

const supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const state = {
  events: [],
  currentEvent: null,
  selectedSessionId: null,
  lastTriggerEl: null,
  animationObserver: null,
  animationsInitialized: false,
  user: null,
  authView: 'login',
  lastAuthTriggerEl: null,
  authNotice: null,
  accountMode: 'summary',
  heroRenderFrame: null,
  heroRenderTimeout: null,
  pendingProfileAvatarFile: null,
  pendingProfileAvatarPreviewUrl: null,
  pendingProfileRemoveAvatar: false,
  myRegistrations: [],
  myRegistrationsStatus: 'idle',
  myRegistrationsError: '',
  myRegistrationsForEmail: ''
};

function getUserMetadata(user = state.user) {
  return user?.user_metadata || {};
}

function getUserDisplayName(user = state.user) {
  const metadata = getUserMetadata(user);
  const fullName = String(metadata.full_name || '').trim();
  if (fullName) return fullName;
  const email = String(user?.email || '').trim();
  return email ? email.split('@')[0] : 'Account';
}

function getUserPhone(user = state.user) {
  return String(getUserMetadata(user).phone || '').trim();
}

function normalizeGenderValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['male', 'female', 'other', 'prefer_not_to_say'].includes(normalized) ? normalized : '';
}

function getGenderLabel(value, fallback = 'Not saved yet') {
  const labels = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
    prefer_not_to_say: 'Prefer not to say'
  };
  return labels[normalizeGenderValue(value)] || fallback;
}

function buildGenderOptionsHtml(selected = '', includePlaceholder = false) {
  const normalized = normalizeGenderValue(selected);
  const options = [
    ['male', 'Male'],
    ['female', 'Female'],
    ['other', 'Other'],
    ['prefer_not_to_say', 'Prefer not to say']
  ];

  const placeholder = includePlaceholder
    ? `<option value="" ${normalized ? '' : 'selected'} disabled>Select one</option>`
    : '';

  return `${placeholder}${options.map(([value, label]) => `<option value="${value}" ${normalized === value ? 'selected' : ''}>${label}</option>`).join('')}`;
}

function getAvatarInitials(label = '') {
  const initials = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  return initials || 'FT';
}

function buildAvatarPlaceholderDataUri(label = 'Fitness Truck') {
  const initials = getAvatarInitials(label);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320" role="img" aria-label="Default profile avatar">
      <defs>
        <linearGradient id="avatarGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff2d2d" />
          <stop offset="100%" stop-color="#781414" />
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="54" fill="#0f1117" />
      <circle cx="160" cy="160" r="122" fill="url(#avatarGradient)" opacity="0.95" />
      <circle cx="160" cy="128" r="46" fill="rgba(255,255,255,0.2)" />
      <path d="M92 242c14-36 45-58 68-58s54 22 68 58" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="18" stroke-linecap="round" />
      <text x="160" y="289" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="#ffffff">${initials}</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}


function getAvatarFileExtension(file) {
  const name = String(file?.name || '').trim().toLowerCase();
  return name.includes('.') ? name.split('.').pop() : '';
}

function isSupportedAvatarFile(file) {
  if (!file) return false;
  const extension = getAvatarFileExtension(file);
  const type = String(file.type || '').trim().toLowerCase();
  const allowedExtensions = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'avif'];
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif', 'image/avif'];
  if (allowedTypes.includes(type)) return true;
  if (allowedExtensions.includes(extension)) return true;
  return /^image\//i.test(type);
}

function getAvatarContentType(file) {
  const type = String(file?.type || '').trim().toLowerCase();
  if (type) return type;
  const extension = getAvatarFileExtension(file);
  const contentTypes = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    avif: 'image/avif'
  };
  return contentTypes[extension] || 'image/jpeg';
}
function clearPendingProfileAvatarState(options = {}) {
  const { keepRemove = false } = options;
  if (state.pendingProfileAvatarPreviewUrl) {
    try {
      URL.revokeObjectURL(state.pendingProfileAvatarPreviewUrl);
    } catch (error) {
      console.warn('Avatar preview cleanup failed:', error);
    }
  }
  state.pendingProfileAvatarFile = null;
  state.pendingProfileAvatarPreviewUrl = null;
  if (!keepRemove) state.pendingProfileRemoveAvatar = false;
}


function getAvatarUrl(user = state.user) {
  const metadata = getUserMetadata(user);
  const avatarPath = String(metadata.avatar_path || '').trim();

  if (avatarPath) {
    const { data } = supabaseClient.storage.from(CONFIG.AVATAR_BUCKET).getPublicUrl(avatarPath);
    const publicUrl = String(data?.publicUrl || '').trim();
    if (publicUrl) {
      const cacheBuster = metadata.avatar_updated_at ? `?v=${encodeURIComponent(String(metadata.avatar_updated_at))}` : '';
      return `${publicUrl}${cacheBuster}`;
    }
  }

  return buildAvatarPlaceholderDataUri(getUserDisplayName(user));
}

function getUserProfileData(user = state.user) {
  const metadata = getUserMetadata(user);
  return {
    full_name: String(metadata.full_name || '').trim(),
    email: String(user?.email || '').trim().toLowerCase(),
    phone: String(metadata.phone || '').trim(),
    age: metadata.age === 0 || metadata.age ? String(metadata.age).trim() : '',
    gender: normalizeGenderValue(metadata.gender),
    food_allergies: String(metadata.food_allergies || '').trim(),
    medical_conditions: String(metadata.medical_conditions || '').trim(),
    emergency_contact_name: String(metadata.emergency_contact_name || '').trim(),
    emergency_contact_phone: String(metadata.emergency_contact_phone || '').trim(),
    marketing_opt_in: !!metadata.marketing_opt_in,
    avatar_path: String(metadata.avatar_path || '').trim(),
    avatar_updated_at: String(metadata.avatar_updated_at || '').trim(),
    avatar_url: getAvatarUrl(user)
  };
}

function getProfileSummaryValue(value, fallback = 'Not saved yet') {
  return String(value || '').trim() || fallback;
}

function resetMyRegistrationsState() {
  state.myRegistrations = [];
  state.myRegistrationsStatus = 'idle';
  state.myRegistrationsError = '';
  state.myRegistrationsForEmail = '';
}

function normalizeMyRegistrationItem(item = {}) {
  return {
    registration_id: String(item.registration_id || ''),
    created_at: String(item.created_at || ''),
    event_id: String(item.event_id || ''),
    event_title: String(item.event_title || ''),
    event_date: String(item.event_date || ''),
    event_location: String(item.event_location || ''),
    session_id: String(item.session_id || ''),
    session_title: String(item.session_title || ''),
    session_start_time: String(item.session_start_time || ''),
    session_end_time: String(item.session_end_time || ''),
    session_exercise_type: String(item.session_exercise_type || ''),
    session_price_chf: Number(item.session_price_chf || 0),
    event_base_price_chf: Number(item.event_base_price_chf || 0),
    created_at_label: item.created_at ? formatDateTime(item.created_at) : '',
    is_upcoming: !!item.event_date && new Date(item.event_date) >= startOfToday()
  };
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getRegistrationPriceLabel(item) {
  const sessionPrice = Number(item.session_price_chf || 0);
  const eventPrice = Number(item.event_base_price_chf || 0);
  const price = sessionPrice > 0 ? sessionPrice : eventPrice;
  return price > 0 ? `CHF ${price.toFixed(2)}` : 'Price not set yet';
}

function renderMyRegistrationCards(items = [], emptyMessage = 'No registrations yet.') {
  if (!items.length) {
    return `<div class="auth-registrations-empty">${escapeHtml(emptyMessage)}</div>`;
  }

  return items.map((item) => `
    <article class="auth-registration-card">
      <div class="auth-registration-card-top">
        <div>
          <div class="auth-registration-kicker">${item.is_upcoming ? 'Upcoming booking' : 'Past booking'}</div>
          <h4>${escapeHtml(item.event_title || 'Event')}</h4>
        </div>
        <span class="auth-registration-status ${item.is_upcoming ? 'upcoming' : 'past'}">${item.is_upcoming ? 'Upcoming' : 'Completed'}</span>
      </div>
      <div class="auth-registration-meta">
        <span>${escapeHtml(formatDate(item.event_date))}</span>
        <span>${escapeHtml(item.event_location || 'Location to be confirmed')}</span>
      </div>
      <div class="auth-registration-details">
        <div class="auth-registration-detail">
          <strong>Session</strong>
          <span>${escapeHtml(item.session_title || 'Session')}</span>
        </div>
        <div class="auth-registration-detail">
          <strong>Time</strong>
          <span>${escapeHtml(item.session_start_time && item.session_end_time ? `${item.session_start_time} - ${item.session_end_time}` : 'Time to be confirmed')}</span>
        </div>
        <div class="auth-registration-detail">
          <strong>Type</strong>
          <span>${escapeHtml(item.session_exercise_type || 'Experience')}</span>
        </div>
        <div class="auth-registration-detail">
          <strong>Price</strong>
          <span>${escapeHtml(getRegistrationPriceLabel(item))}</span>
        </div>
      </div>
      <div class="auth-registration-footer">
        <span>Booked ${escapeHtml(item.created_at_label || 'recently')}</span>
        ${item.event_id ? `<button type="button" class="btn btn-secondary btn-inline" data-open-booking-event-id="${escapeAttr(item.event_id)}">Open event</button>` : ''}
      </div>
    </article>
  `).join('');
}

function getMyRegistrationsMarkup() {
  if (!state.user) return '';

  if (state.myRegistrationsStatus === 'loading') {
    return `
      <section class="auth-registrations-panel">
        <div class="auth-registrations-header">
          <div>
            <h3>My registrations</h3>
            <p>We are loading your booked sessions now.</p>
          </div>
        </div>
        <div class="auth-registrations-empty">Loading your registrations…</div>
      </section>`;
  }

  if (state.myRegistrationsStatus === 'error') {
    return `
      <section class="auth-registrations-panel">
        <div class="auth-registrations-header">
          <div>
            <h3>My registrations</h3>
            <p>Your booked sessions appear here once we can read them.</p>
          </div>
          <button type="button" class="btn btn-secondary btn-inline" id="retryMyRegistrationsBtn">Try again</button>
        </div>
        <div class="auth-registrations-empty">${escapeHtml(state.myRegistrationsError || 'We could not load your registrations yet.')}</div>
      </section>`;
  }

  const upcoming = state.myRegistrations.filter((item) => item.is_upcoming);
  const past = state.myRegistrations.filter((item) => !item.is_upcoming);

  return `
    <section class="auth-registrations-panel">
      <div class="auth-registrations-header">
        <div>
          <h3>My registrations</h3>
          <p>See the sessions you already booked with this email address.</p>
        </div>
        <span class="auth-registrations-count">${state.myRegistrations.length} total</span>
      </div>
      <div class="auth-registrations-group">
        <div class="auth-registrations-group-header">
          <strong>Upcoming</strong>
          <span>${upcoming.length}</span>
        </div>
        ${renderMyRegistrationCards(upcoming, 'No upcoming bookings yet.')}
      </div>
      <div class="auth-registrations-group">
        <div class="auth-registrations-group-header">
          <strong>Past</strong>
          <span>${past.length}</span>
        </div>
        ${renderMyRegistrationCards(past, 'Your completed sessions will appear here later.')}
      </div>
    </section>`;
}

async function loadMyRegistrations(options = {}) {
  const { force = false } = options;
  const userEmail = String(state.user?.email || '').trim().toLowerCase();
  if (!userEmail) {
    resetMyRegistrationsState();
    return [];
  }

  if (!force && state.myRegistrationsStatus === 'loading') return state.myRegistrations;
  if (!force && state.myRegistrationsStatus === 'success' && state.myRegistrationsForEmail === userEmail) return state.myRegistrations;

  state.myRegistrationsStatus = 'loading';
  state.myRegistrationsError = '';
  if (isAuthModalOpen() && state.user && state.accountMode === 'summary') renderAuthModal();

  try {
    const { data, error } = await supabaseClient.rpc('get_my_registrations');
    if (error) throw error;

    state.myRegistrations = Array.isArray(data) ? data.map(normalizeMyRegistrationItem) : [];
    state.myRegistrationsStatus = 'success';
    state.myRegistrationsForEmail = userEmail;
    state.myRegistrationsError = '';
  } catch (error) {
    console.error('My registrations load error:', error);
    state.myRegistrations = [];
    state.myRegistrationsStatus = 'error';
    state.myRegistrationsForEmail = userEmail;
    state.myRegistrationsError = error.message || 'Could not load your registrations.';
  }

  if (isAuthModalOpen() && state.user && state.accountMode === 'summary') renderAuthModal();
  return state.myRegistrations;
}

function updateAccountButton() {
  const button = document.getElementById('accountBtn');
  if (!button) return;
  if (state.user) {
    button.textContent = 'My Account';
    button.classList.add('account-pill');
    button.setAttribute('aria-label', `Open account for ${getUserDisplayName()}`);
    button.setAttribute('title', getUserDisplayName());
  } else {
    button.textContent = 'Account';
    button.classList.remove('account-pill');
    button.setAttribute('aria-label', 'Open account');
    button.removeAttribute('title');
  }
}

function setAuthNotice(message = '', type = 'info') {
  state.authNotice = message ? { message, type } : null;
}

function renderSignedInHeroFallback(mount) {
  mount.hidden = false;
  mount.innerHTML = `
    <div class="floating-card next-event-hero-card">
      <div class="card-glow"></div>
      <span class="next-event-kicker">Signed in</span>
      <h3>Welcome back, ${escapeHtml(getUserDisplayName())}</h3>
      <p>Your account is active. Browse the schedule or open your account details anytime.</p>
      <div class="account-card-actions">
        <button type="button" class="btn btn-primary" id="heroBrowseEventsBtn">View schedule</button>
        <button type="button" class="btn btn-secondary" id="heroFallbackAccountBtn">My account</button>
      </div>
    </div>`;

  document.getElementById('heroBrowseEventsBtn')?.addEventListener('click', () => {
    const eventsSection = document.getElementById('events');
    if (eventsSection) {
      const offsetTop = eventsSection.offsetTop - 80;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    }
  });
  document.getElementById('heroFallbackAccountBtn')?.addEventListener('click', (event) => openAuthModal('login', event.currentTarget));
}

function scheduleHeroSideCardRender() {
  if (state.heroRenderFrame) cancelAnimationFrame(state.heroRenderFrame);
  if (state.heroRenderTimeout) clearTimeout(state.heroRenderTimeout);

  state.heroRenderFrame = requestAnimationFrame(() => {
    state.heroRenderFrame = null;
    try {
      renderHeroSideCard();
    } catch (error) {
      console.error('Hero side card render error:', error);
      const mount = document.getElementById('heroSideCard');
      if (mount && state.user) renderSignedInHeroFallback(mount);
    }
  });

  state.heroRenderTimeout = setTimeout(() => {
    state.heroRenderTimeout = null;
    try {
      renderHeroSideCard();
    } catch (error) {
      console.error('Delayed hero side card render error:', error);
      const mount = document.getElementById('heroSideCard');
      if (mount && state.user) renderSignedInHeroFallback(mount);
    }
  }, 180);
}

function refreshAuthDependentUI() {
  document.body.dataset.authState = state.user ? 'logged-in' : 'logged-out';
  if (!state.user) {
    state.accountMode = 'summary';
    resetMyRegistrationsState();
  } else if (state.myRegistrationsForEmail && state.myRegistrationsForEmail !== String(state.user.email || '').trim().toLowerCase()) {
    resetMyRegistrationsState();
  }
  updateAccountButton();
  scheduleHeroSideCardRender();
  if (isAuthModalOpen()) {
    if (!(state.user && state.accountMode === 'edit')) {
      renderAuthModal();
    }
  }
  populateRegistrationFormFromUser(document.getElementById('sessionRegistrationForm'));
}

function bindAuthLaunchers(root = document) {
  root.querySelectorAll('[data-open-auth]').forEach((button) => {
    if (button.dataset.authBound === '1') return;
    button.dataset.authBound = '1';
    button.addEventListener('click', (event) => {
      const view = button.dataset.openAuth === 'signup' ? 'signup' : 'login';
      openAuthModal(view, event.currentTarget);
    });
  });
}

function renderHeroSideCard() {
  const mount = document.getElementById('heroSideCard');
  if (!mount) return;

  mount.dataset.authState = state.user ? 'logged-in' : 'logged-out';

  if (!state.user) {
    mount.hidden = false;
    mount.innerHTML = `
      <div class="floating-card account-hero-card">
        <div class="card-glow"></div>
        <span class="account-hero-label">Member access</span>
        <h3>Create your account</h3>
        <p>Save your details for faster bookings, view your account anytime, and choose whether to receive event news and early-access updates.</p>
        <div class="account-card-actions">
          <button type="button" class="btn btn-primary" data-open-auth="signup">Create account</button>
          <button type="button" class="btn btn-secondary" data-open-auth="login">Log in</button>
        </div>
        <div class="account-benefits" aria-label="Account benefits">
          <div class="account-benefit">✓ Faster repeat registrations</div>
          <div class="account-benefit">✓ Optional event news opt-in</div>
          <div class="account-benefit">✓ Guest booking still available</div>
        </div>
      </div>`;
    bindAuthLaunchers(mount);
    return;
  }

  const nextEvent = getUpcomingEvents()[0] || null;
  if (!nextEvent || !Array.isArray(nextEvent.sessions)) {
    renderSignedInHeroFallback(mount);
    return;
  }

  const totalSpots = nextEvent.sessions.reduce((sum, session) => sum + Number(session.maxParticipants || 0), 0);
  const totalRegistered = nextEvent.sessions.reduce((sum, session) => sum + Number(session.registered || 0), 0);
  const remainingSpots = Math.max(totalSpots - totalRegistered, 0);

  mount.hidden = false;
  mount.innerHTML = `
    <div class="floating-card next-event-hero-card">
      <div class="card-glow"></div>
      <span class="next-event-kicker">Next event</span>
      <h3>${escapeHtml(nextEvent.title)}</h3>
      <p>You're signed in. Here is the next event you can book right away.</p>
      <div class="next-event-meta">
        <span>${escapeHtml(formatDate(nextEvent.date))}</span>
        <span>${escapeHtml(nextEvent.location)}</span>
      </div>
      <div class="next-event-summary">
        <div class="next-event-summary-item">
          <strong>Sessions</strong>
          ${nextEvent.sessions.length} available session${nextEvent.sessions.length === 1 ? '' : 's'}
        </div>
        <div class="next-event-summary-item">
          <strong>Availability</strong>
          ${remainingSpots} of ${totalSpots} spots still open
        </div>
      </div>
      <div class="account-card-actions">
        <button type="button" class="btn btn-primary" id="heroNextEventBtn">View next event</button>
        <button type="button" class="btn btn-secondary" id="heroMyAccountBtn">My account</button>
      </div>
    </div>`;

  document.getElementById('heroNextEventBtn')?.addEventListener('click', () => openEventModal(nextEvent.id));
  document.getElementById('heroMyAccountBtn')?.addEventListener('click', (event) => openAuthModal('login', event.currentTarget));
}

function openAuthModal(view = 'login', triggerEl = document.activeElement) {
  state.authView = view === 'signup' ? 'signup' : 'login';
  if (state.user) state.accountMode = 'summary';
  state.lastAuthTriggerEl = triggerEl || null;
  renderAuthModal();
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  if (state.user && state.accountMode === 'summary') {
    loadMyRegistrations();
  }
  setTimeout(() => {
    const firstInput = overlay.querySelector('input, button');
    if (firstInput) firstInput.focus();
  }, 20);
}

function closeAuthModal() {
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  const eventOverlay = document.getElementById('modalOverlay');
  const eventModalOpen = eventOverlay && eventOverlay.getAttribute('aria-hidden') === 'false';
  document.body.style.overflow = eventModalOpen ? 'hidden' : '';
  if (state.lastAuthTriggerEl) state.lastAuthTriggerEl.focus();
}

function isAuthModalOpen() {
  const overlay = document.getElementById('authOverlay');
  return !!overlay && overlay.getAttribute('aria-hidden') === 'false';
}

function renderAuthModal() {
  const mount = document.getElementById('authModalContent');
  if (!mount) return;

  if (state.user) {
    const profile = getUserProfileData();

    if (state.accountMode === 'edit') {
      mount.innerHTML = `
        <div class="auth-card">
          <span class="auth-status-pill">Signed in</span>
          <div>
            <h2 class="auth-title" id="authModalTitle">Edit profile</h2>
            <p class="auth-muted">Save your default booking details once so future registrations are faster.</p>
          </div>
          <div class="auth-profile-layout">
            <div class="auth-avatar-panel">
              <img src="${escapeAttr(state.pendingProfileAvatarPreviewUrl || (state.pendingProfileRemoveAvatar ? buildAvatarPlaceholderDataUri(getUserDisplayName()) : profile.avatar_url))}" alt="${escapeAttr(`${getUserDisplayName()} profile photo`)}" class="auth-avatar-image auth-avatar-image-large" id="profileAvatarPreview" />
              <div class="auth-avatar-copy">
                <strong>Profile photo</strong>
                <span>Add a photo for your account, or keep the generic avatar.</span>
              </div>
            </div>
            <div class="auth-profile-static">
              <strong>Login email</strong>
              <span>${escapeHtml(profile.email || '')}</span>
              <p class="auth-profile-note">Your login email is already used automatically for registrations.</p>
            </div>
          </div>
          <form id="profileEditForm" class="auth-form auth-profile-form">
            <input type="hidden" name="remove_avatar" id="profileRemoveAvatar" value="${state.pendingProfileRemoveAvatar ? '1' : '0'}" />
            <div class="auth-profile-grid">
              <div class="form-group form-group-full">
                <label>Profile photo</label>
                <div class="auth-avatar-picker-row">
                  <button type="button" class="btn btn-secondary btn-inline" id="chooseAvatarBtn">Choose photo</button>
                  <button type="button" class="btn btn-secondary btn-inline" id="removeAvatarBtn">Use generic avatar</button>
                </div>
                <div class="auth-profile-note">PNG, JPG, JPEG, WEBP, HEIC, HEIF, or AVIF up to 5 MB.</div>
                <div class="auth-profile-note" id="profileAvatarStatus">${escapeHtml(state.pendingProfileAvatarFile?.name ? `Selected: ${state.pendingProfileAvatarFile.name}` : (state.pendingProfileRemoveAvatar ? 'Using the generic avatar.' : 'No new file selected.'))}</div>
              </div>
              <div class="form-group">
                <label for="profileFullName">Full name *</label>
                <input id="profileFullName" name="full_name" type="text" required autocomplete="name" value="${escapeAttr(profile.full_name)}" />
              </div>
              <div class="form-group">
                <label for="profilePhone">Phone number *</label>
                <input id="profilePhone" name="phone" type="tel" required autocomplete="tel" value="${escapeAttr(profile.phone)}" />
              </div>
              <div class="form-group">
                <label for="profileGender">Gender</label>
                <select id="profileGender" name="gender">
                  <option value="">Prefer to choose later</option>
                  ${buildGenderOptionsHtml(profile.gender)}
                </select>
              </div>
              <div class="form-group">
                <label for="profileAge">Age</label>
                <input id="profileAge" name="age" type="number" min="1" max="120" inputmode="numeric" value="${escapeAttr(profile.age)}" />
              </div>
              <div class="form-group">
                <label for="profileEmergencyName">Emergency contact name</label>
                <input id="profileEmergencyName" name="emergency_contact_name" type="text" autocomplete="name" value="${escapeAttr(profile.emergency_contact_name)}" />
              </div>
              <div class="form-group">
                <label for="profileEmergencyPhone">Emergency contact phone</label>
                <input id="profileEmergencyPhone" name="emergency_contact_phone" type="tel" autocomplete="tel" value="${escapeAttr(profile.emergency_contact_phone)}" />
              </div>
              <div class="form-group form-checkbox-group form-group-full">
                <label class="checkbox-row auth-checkbox-row" for="profileMarketingOptIn">
                  <input id="profileMarketingOptIn" name="marketing_opt_in" type="checkbox" ${profile.marketing_opt_in ? 'checked' : ''} />
                  <span>Email me news, early access, and event updates.</span>
                </label>
              </div>
              <div class="form-group form-group-full">
                <label for="profileAllergies">Food allergies</label>
                <textarea id="profileAllergies" name="food_allergies" rows="3" placeholder="List any allergies or write none.">${escapeHtml(profile.food_allergies)}</textarea>
              </div>
              <div class="form-group form-group-full">
                <label for="profileMedical">Medical / physical conditions</label>
                <textarea id="profileMedical" name="medical_conditions" rows="3" placeholder="Anything you want prefilled for future registrations.">${escapeHtml(profile.medical_conditions)}</textarea>
              </div>
            </div>
            <div class="auth-actions">
              <button type="submit" class="btn btn-primary">Save profile</button>
              <button type="button" class="btn btn-secondary" id="cancelProfileEditBtn">Cancel</button>
            </div>
          </form>
        </div>`;

      bindProfileAvatarControls(profile);
      document.getElementById('profileEditForm')?.addEventListener('submit', handleProfileSaveSubmit);
      document.getElementById('cancelProfileEditBtn')?.addEventListener('click', () => {
        clearPendingProfileAvatarState();
        state.accountMode = 'summary';
        renderAuthModal();
      });
      return;
    }

    mount.innerHTML = `
      <div class="auth-card">
        <span class="auth-status-pill">Signed in</span>
        <div>
          <h2 class="auth-title" id="authModalTitle">Your account</h2>
          <p class="auth-muted">These saved details can be reused automatically when you register for a session.</p>
        </div>
        <div class="auth-account-header">
          <img src="${escapeAttr(profile.avatar_url)}" alt="${escapeAttr(`${getUserDisplayName()} profile photo`)}" class="auth-avatar-image auth-avatar-image-large" />
          <div class="auth-account-header-copy">
            <h3>${escapeHtml(getProfileSummaryValue(profile.full_name, getUserDisplayName()))}</h3>
            <p>${escapeHtml(profile.email || '')}</p>
            <span>${escapeHtml(getGenderLabel(profile.gender, 'Gender not saved yet'))}</span>
          </div>
        </div>
        <div class="auth-summary-grid">
          <div class="auth-summary-item">
            <strong>Name</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.full_name, getUserDisplayName()))}</span>
          </div>
          <div class="auth-summary-item">
            <strong>Email</strong>
            <span>${escapeHtml(profile.email || '')}</span>
          </div>
          <div class="auth-summary-item">
            <strong>Phone</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.phone))}</span>
          </div>
          <div class="auth-summary-item">
            <strong>Age</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.age))}</span>
          </div>
          <div class="auth-summary-item">
            <strong>Gender</strong>
            <span>${escapeHtml(getGenderLabel(profile.gender))}</span>
          </div>
          <div class="auth-summary-item">
            <strong>News updates</strong>
            <span>${profile.marketing_opt_in ? 'Subscribed' : 'Not subscribed'}</span>
          </div>
          <div class="auth-summary-item full-width">
            <strong>Emergency contact</strong>
            <span>${escapeHtml(profile.emergency_contact_name && profile.emergency_contact_phone ? `${profile.emergency_contact_name} · ${profile.emergency_contact_phone}` : profile.emergency_contact_name || profile.emergency_contact_phone || 'Not saved yet')}</span>
          </div>
          <div class="auth-summary-item full-width">
            <strong>Food allergies</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.food_allergies, 'Nothing saved yet'))}</span>
          </div>
          <div class="auth-summary-item full-width">
            <strong>Medical / physical notes</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.medical_conditions, 'Nothing saved yet'))}</span>
          </div>
        </div>
        ${getMyRegistrationsMarkup()}
        <div class="auth-actions">
          <button type="button" class="btn btn-primary" id="editProfileBtn">Edit profile</button>
          <button type="button" class="btn btn-secondary" id="closeAuthAndBrowseBtn">Continue booking</button>
          <button type="button" class="btn btn-secondary" id="logoutAccountBtn">Log out</button>
        </div>
      </div>`;

    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
      clearPendingProfileAvatarState();
      state.accountMode = 'edit';
      renderAuthModal();
    });
    document.getElementById('closeAuthAndBrowseBtn')?.addEventListener('click', closeAuthModal);
    document.getElementById('logoutAccountBtn')?.addEventListener('click', logoutCurrentUser);
    document.getElementById('retryMyRegistrationsBtn')?.addEventListener('click', () => loadMyRegistrations({ force: true }));
    mount.querySelectorAll('[data-open-booking-event-id]').forEach((button) => {
      button.addEventListener('click', () => {
        closeAuthModal();
        openEventModal(button.dataset.openBookingEventId);
      });
    });
    return;
  }

  mount.innerHTML = `
    <div class="auth-card">
      <div>
        <h2 class="auth-title" id="authModalTitle">Account</h2>
        <p class="auth-muted">Create a secure Fitness Truck login, or sign in to reuse your details faster.</p>
      </div>
      <div class="auth-switch" role="tablist" aria-label="Choose account action">
        <button type="button" class="auth-switch-btn ${state.authView === 'login' ? 'active' : ''}" data-auth-view="login">Log in</button>
        <button type="button" class="auth-switch-btn ${state.authView === 'signup' ? 'active' : ''}" data-auth-view="signup">Create account</button>
      </div>
      ${state.authNotice ? `<div class="auth-notice ${escapeAttr(state.authNotice.type || 'info')}">${escapeHtml(state.authNotice.message)}</div>` : ''}
      ${state.authView === 'signup' ? `
        <form id="signupForm" class="auth-form">
          <div class="form-group">
            <label for="signupFullName">Full name *</label>
            <input id="signupFullName" name="full_name" type="text" required autocomplete="name" />
          </div>
          <div class="form-group">
            <label for="signupPhone">Phone number *</label>
            <input id="signupPhone" name="phone" type="tel" required autocomplete="tel" />
          </div>
          <div class="form-group">
            <label for="signupEmail">Email *</label>
            <input id="signupEmail" name="email" type="email" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="signupPassword">Password *</label>
            <input id="signupPassword" name="password" type="password" minlength="6" required autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label for="signupConfirmPassword">Confirm password *</label>
            <input id="signupConfirmPassword" name="confirm_password" type="password" minlength="6" required autocomplete="new-password" />
          </div>
          <div class="form-group form-checkbox-group">
            <label class="checkbox-row auth-checkbox-row" for="signupMarketingOptIn">
              <input id="signupMarketingOptIn" name="marketing_opt_in" type="checkbox" />
              <span>Email me news, early access, and event updates.</span>
            </label>
            <p class="auth-optin-note">Optional and separate from your account login.</p>
          </div>
          <button type="submit" class="btn btn-primary">Create account</button>
          <p class="auth-confirm-hint">After signup, confirm your email from the message we send you before your first login.</p>
        </form>
      ` : `
        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label for="loginEmail">Email *</label>
            <input id="loginEmail" name="email" type="email" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="loginPassword">Password *</label>
            <input id="loginPassword" name="password" type="password" required autocomplete="current-password" />
          </div>
          <button type="submit" class="btn btn-primary">Log in</button>
        </form>
      `}
      <p class="auth-helper">Guest booking still works. This account option just saves time for returning users.</p>
    </div>`;

  mount.querySelectorAll('[data-auth-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.authView = button.dataset.authView === 'signup' ? 'signup' : 'login';
      if (state.authView === 'signup' && state.authNotice?.type === 'success') setAuthNotice();
      renderAuthModal();
    });
  });

  document.getElementById('loginForm')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('signupForm')?.addEventListener('submit', handleSignupSubmit);
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');

  button.disabled = true;
  button.textContent = 'Logging in...';

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.user = data.user || null;
    state.accountMode = 'summary';
    setAuthNotice();
    refreshAuthDependentUI();
    showToast('You are now logged in.', 'success');
    closeAuthModal();
  } catch (error) {
    console.error('Login error:', error);
    const errorMessage = error?.message || 'Login failed.';
    if (/email not confirmed/i.test(errorMessage)) {
      setAuthNotice('Please confirm your email first. Open the confirmation email we sent after signup, then come back and log in.', 'info');
      renderAuthModal();
      const loginEmail = document.getElementById('loginEmail');
      if (loginEmail) loginEmail.value = email;
      showToast('Please confirm your email before logging in.', 'error');
    } else {
      showToast(errorMessage, 'error');
    }
    button.disabled = false;
    button.textContent = 'Log in';
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const fullName = String(formData.get('full_name') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirm_password') || '');
  const marketingOptIn = formData.get('marketing_opt_in') === 'on';

  if (password !== confirmPassword) {
    showToast('Please re-enter the same password in both fields.', 'error');
    const confirmInput = document.getElementById('signupConfirmPassword');
    if (confirmInput) {
      confirmInput.value = '';
      confirmInput.focus();
    }
    return;
  }

  button.disabled = true;
  button.textContent = 'Creating account...';

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
          marketing_opt_in: marketingOptIn
        }
      }
    });
    if (error) throw error;

    if (data.session) {
      state.user = data.user || null;
      state.accountMode = 'summary';
      setAuthNotice();
      refreshAuthDependentUI();
      loadMyRegistrations({ force: true });
      showToast('Account created and you are now logged in.', 'success');
      closeAuthModal();
      return;
    }

    state.authView = 'login';
    setAuthNotice(`Your account was created for ${email}. Please confirm your email from your inbox before you try to log in.`, 'success');
    renderAuthModal();
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;
    showToast('Account created. Confirm your email first, then log in.', 'success');
  } catch (error) {
    console.error('Signup error:', error);
    showToast(error.message || 'Account creation failed.', 'error');
    button.disabled = false;
    button.textContent = 'Create account';
  }
}

async function logoutCurrentUser() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    state.user = null;
    setAuthNotice();
    refreshAuthDependentUI();
    renderAuthModal();
    showToast('You are now logged out.', 'success');
  } catch (error) {
    console.error('Logout error:', error);
    showToast(error.message || 'Logout failed.', 'error');
  }
}

function bindProfileAvatarControls(profile) {
  const preview = document.getElementById('profileAvatarPreview');
  const chooseButton = document.getElementById('chooseAvatarBtn');
  const removeInput = document.getElementById('profileRemoveAvatar');
  const removeButton = document.getElementById('removeAvatarBtn');
  const status = document.getElementById('profileAvatarStatus');
  if (!preview || !removeInput || !removeButton || !chooseButton) return;

  const fallbackSrc = buildAvatarPlaceholderDataUri(getUserDisplayName());

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const applyPendingAvatarUi = () => {
    if (state.pendingProfileAvatarFile && state.pendingProfileAvatarPreviewUrl) {
      preview.src = state.pendingProfileAvatarPreviewUrl;
      removeInput.value = '0';
      setStatus(`Selected: ${state.pendingProfileAvatarFile.name}`);
      return;
    }

    if (state.pendingProfileRemoveAvatar) {
      preview.src = fallbackSrc;
      removeInput.value = '1';
      setStatus('Using the generic avatar.');
      return;
    }

    preview.src = profile.avatar_url || fallbackSrc;
    removeInput.value = '0';
    setStatus('No new file selected.');
  };

  applyPendingAvatarUi();

  chooseButton.addEventListener('click', () => {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*,.heic,.heif,.avif';
    picker.style.position = 'fixed';
    picker.style.left = '-9999px';
    picker.style.top = '0';
    document.body.appendChild(picker);

    picker.addEventListener('change', async () => {
      const selectedFile = picker.files?.[0];
      picker.remove();

      if (!selectedFile) {
        applyPendingAvatarUi();
        return;
      }

      if (!isSupportedAvatarFile(selectedFile)) {
        applyPendingAvatarUi();
        showToast('Please choose a PNG, JPG, JPEG, WEBP, HEIC, HEIF, or AVIF image.', 'error');
        return;
      }

      if (selectedFile.size > 5 * 1024 * 1024) {
        applyPendingAvatarUi();
        showToast('Please choose an image smaller than 5 MB.', 'error');
        return;
      }

      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const contentType = getAvatarContentType(selectedFile);
        const blob = new Blob([arrayBuffer], { type: contentType });

        clearPendingProfileAvatarState();
        state.pendingProfileAvatarFile = {
          name: selectedFile.name,
          size: selectedFile.size,
          type: contentType,
          extension: getAvatarFileExtension(selectedFile),
          arrayBuffer
        };
        state.pendingProfileRemoveAvatar = false;
        removeInput.value = '0';
        setStatus(`Selected: ${selectedFile.name}`);

        try {
          state.pendingProfileAvatarPreviewUrl = URL.createObjectURL(blob);
          preview.src = state.pendingProfileAvatarPreviewUrl;
        } catch (previewError) {
          console.warn('Avatar preview creation failed:', previewError);
          preview.src = profile.avatar_url || fallbackSrc;
          setStatus(`Selected: ${selectedFile.name} (preview not available in this browser)`);
        }
      } catch (readError) {
        console.error('Avatar file read failed:', readError);
        clearPendingProfileAvatarState();
        applyPendingAvatarUi();
        showToast('We could not read that image file. Please try a different image.', 'error');
      }
    }, { once: true });

    picker.click();
  });

  removeButton.addEventListener('click', () => {
    clearPendingProfileAvatarState({ keepRemove: true });
    state.pendingProfileRemoveAvatar = true;
    removeInput.value = '1';
    preview.src = fallbackSrc;
    setStatus('Using the generic avatar.');
  });
}

async function uploadAvatarFile(file) {
  if (!state.user?.id) throw new Error('You need to be logged in to upload a profile photo.');
  if (!file) return null;
  if (!isSupportedAvatarFile(file)) throw new Error('Please choose a PNG, JPG, WEBP, HEIC, HEIF, or AVIF image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Please choose an image smaller than 5 MB.');

  const extensionFromName = getAvatarFileExtension(file);
  const contentType = getAvatarContentType(file);
  const extension = ['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'avif'].includes(extensionFromName)
    ? extensionFromName
    : (contentType === 'image/png' ? 'png'
      : contentType === 'image/webp' ? 'webp'
      : contentType === 'image/heic' ? 'heic'
      : contentType === 'image/heif' ? 'heif'
      : contentType === 'image/avif' ? 'avif'
      : 'jpg');

  let payload = file;
  if (!(file instanceof Blob)) {
    if (file.arrayBuffer) {
      payload = new Blob([file.arrayBuffer], { type: contentType });
    } else {
      throw new Error('The selected image could not be prepared for upload. Please choose it again.');
    }
  }

  const previousPath = String(getUserMetadata().avatar_path || '').trim();
  const updatedAt = Date.now();
  const path = `${state.user.id}/avatar-${updatedAt}.${extension}`;

  const { error } = await supabaseClient.storage
    .from(CONFIG.AVATAR_BUCKET)
    .upload(path, payload, {
      cacheControl: '3600',
      upsert: false,
      contentType
    });

  if (error) throw error;

  if (previousPath && previousPath !== path) {
    const { error: removeError } = await supabaseClient.storage.from(CONFIG.AVATAR_BUCKET).remove([previousPath]);
    if (removeError) console.warn('Old avatar cleanup failed:', removeError.message || removeError);
  }

  return { path, updatedAt };
}

async function removeAvatarFile(path) {
  const safePath = String(path || '').trim();
  if (!safePath) return;
  const { error } = await supabaseClient.storage.from(CONFIG.AVATAR_BUCKET).remove([safePath]);
  if (error) throw error;
}

async function handleProfileSaveSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);

  const profileData = {
    full_name: String(formData.get('full_name') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    age: String(formData.get('age') || '').trim(),
    gender: normalizeGenderValue(formData.get('gender')),
    food_allergies: String(formData.get('food_allergies') || '').trim(),
    medical_conditions: String(formData.get('medical_conditions') || '').trim(),
    emergency_contact_name: String(formData.get('emergency_contact_name') || '').trim(),
    emergency_contact_phone: String(formData.get('emergency_contact_phone') || '').trim(),
    marketing_opt_in: formData.get('marketing_opt_in') === 'on'
  };

  if (!profileData.full_name || !profileData.phone) {
    showToast('Please save at least your full name and phone number.', 'error');
    return;
  }

  button.disabled = true;
  button.textContent = 'Saving profile...';

  try {
    const removeAvatar = formData.get('remove_avatar') === '1' || state.pendingProfileRemoveAvatar;
    const avatarFile = state.pendingProfileAvatarFile;
    const currentAvatarPath = String(getUserMetadata().avatar_path || '').trim();

    let avatarPath = currentAvatarPath || null;
    let avatarUpdatedAt = getUserMetadata().avatar_updated_at || null;

    if (removeAvatar && currentAvatarPath) {
      await removeAvatarFile(currentAvatarPath);
      avatarPath = null;
      avatarUpdatedAt = Date.now();
    }

    if (avatarFile && typeof avatarFile === 'object' && avatarFile.size > 0) {
      const uploadedAvatar = await uploadAvatarFile(avatarFile);
      avatarPath = uploadedAvatar.path;
      avatarUpdatedAt = uploadedAvatar.updatedAt;
    }

    const { data, error } = await supabaseClient.auth.updateUser({
      data: {
        ...profileData,
        age: profileData.age ? Number(profileData.age) : null,
        gender: profileData.gender || null,
        avatar_path: avatarPath,
        avatar_updated_at: avatarUpdatedAt
      }
    });
    if (error) throw error;

    state.user = data?.user || state.user;
    clearPendingProfileAvatarState();
    state.pendingProfileRemoveAvatar = false;
    state.accountMode = 'summary';
    refreshAuthDependentUI();
    populateRegistrationFormFromUser(document.getElementById('sessionRegistrationForm'), { overwrite: true });
    renderAuthModal();
    showToast('Profile saved. Future registrations will be prefilled.', 'success');
  } catch (error) {
    console.error('Profile save error:', error);
    showToast(error.message || 'Could not save your profile.', 'error');
    button.disabled = false;
    button.textContent = 'Save profile';
  }
}

function populateRegistrationFormFromUser(form, options = {}) {
  const { overwrite = false } = options;
  if (!form || !state.user) return;

  const profile = getUserProfileData();
  const fields = {
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    age: profile.age,
    gender: profile.gender,
    food_allergies: profile.food_allergies,
    medical_conditions: profile.medical_conditions,
    emergency_contact_name: profile.emergency_contact_name,
    emergency_contact_phone: profile.emergency_contact_phone
  };

  Object.entries(fields).forEach(([name, value]) => {
    if (!String(value || '').trim()) return;
    const input = form.elements.namedItem(name);
    if (!input) return;

    const currentValue = String(input.value || '').trim();
    if (!overwrite && currentValue) return;
    input.value = value;
  });
}

async function syncAuthUI(options = {}) {
  const { refreshFromServer = false } = options;

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    state.user = data?.session?.user || null;

    if (!state.user && refreshFromServer) {
      const { data: userData, error: userError } = await supabaseClient.auth.getUser();
      if (userError) throw userError;
      state.user = userData?.user || null;
    }
  } catch (error) {
    console.error('Auth state sync error:', error);
    state.user = null;
  }

  refreshAuthDependentUI();
}

function initAuth() {
  refreshAuthDependentUI();

  document.getElementById('accountBtn')?.addEventListener('click', (event) => {
    const navLinks = document.getElementById('navLinks');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (navLinks?.classList.contains('active')) {
      navLinks.classList.remove('active');
      mobileMenuBtn?.setAttribute('aria-expanded', 'false');
    }
    openAuthModal('login', event.currentTarget);
  });

  document.getElementById('authModalClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authOverlay')?.addEventListener('click', (event) => {
    if (event.target.id === 'authOverlay') closeAuthModal();
  });

  document.addEventListener('keydown', (event) => {
    const overlay = document.getElementById('authOverlay');
    const isOpen = overlay && overlay.getAttribute('aria-hidden') === 'false';
    if (!isOpen) return;
    if (event.key === 'Escape') closeAuthModal();
    if (event.key === 'Tab') {
      const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  syncAuthUI({ refreshFromServer: true });

  window.addEventListener('focus', () => {
    if (isAuthModalOpen() && state.user && state.accountMode === 'edit') return;
    syncAuthUI();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (isAuthModalOpen() && state.user && state.accountMode === 'edit') return;
    syncAuthUI();
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    const wasEditingProfile = isAuthModalOpen() && state.user && state.accountMode === 'edit';
    state.user = session?.user || null;
    if (state.user) {
      if (!wasEditingProfile) state.accountMode = 'summary';
    } else {
      state.accountMode = 'summary';
      clearPendingProfileAvatarState();
      resetMyRegistrationsState();
    }
    refreshAuthDependentUI();
    if (state.user && !wasEditingProfile) loadMyRegistrations();
  });
}


async function loadEvents() {
  try {
    const { data: events, error: eventsError } = await supabaseClient
      .from('events')
      .select('*')
      .order('date', { ascending: true });
    if (eventsError) throw eventsError;

    const { data: sessions, error: sessionsError } = await supabaseClient
      .from('sessions')
      .select('*')
      .order('start_time', { ascending: true });
    if (sessionsError) throw sessionsError;

    state.events = (events || []).map((event) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      location: event.location,
      description: event.description || '',
      heroPhrase: event.hero_phrase || '',
      basePriceChf: event.base_price_chf || 0,
      sessions: (sessions || [])
        .filter((session) => session.event_id === event.id)
        .map((session) => ({
          id: session.id,
          title: session.title,
          startTime: session.start_time,
          endTime: session.end_time,
          exerciseType: session.exercise_type,
          maxParticipants: session.max_participants,
          registered: session.registered_count,
          priceChf: session.price_chf
        }))
    }));
  } catch (error) {
    console.error('Failed to load events:', error);
    showToast('Failed to load events. Please refresh.', 'error');
    state.events = [];
  }

  renderEvents();
  renderCalendar();
  updateEmptyState();
  scheduleHeroSideCardRender();
  observeAnimatable();
}

function getUpcomingEvents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return state.events
    .filter((event) => new Date(event.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function updateEmptyState() {
  const hasUpcoming = getUpcomingEvents().length > 0;
  document.getElementById('emptyStateEvents').hidden = hasUpcoming;
  document.getElementById('calendarSection').style.display = hasUpcoming ? 'block' : 'none';
  document.getElementById('featured-events').style.display = hasUpcoming ? 'grid' : 'none';
}

function renderEvents() {
  const container = document.getElementById('featured-events');
  if (!container) return;

  const upcomingEvents = getUpcomingEvents().slice(0, 2);
  container.innerHTML = upcomingEvents.map((event) => {
    const isSoldOut = event.sessions.every((session) => session.registered >= session.maxParticipants);
    const totalSpots = event.sessions.reduce((sum, session) => sum + session.maxParticipants, 0);
    const totalRegistered = event.sessions.reduce((sum, session) => sum + session.registered, 0);
    const fillPercentage = totalSpots ? (totalRegistered / totalSpots) * 100 : 0;

    return `
      <article class="event-card" tabindex="0" data-event-id="${escapeAttr(event.id)}">
        <div class="event-image" data-location="${escapeAttr(event.location.split(' ')[0] || event.location)}">
          ${isSoldOut ? '<span class="event-badge sold-out">Sold Out</span>' : fillPercentage > 80 ? '<span class="event-badge">Almost Full</span>' : ''}
        </div>
        <div class="event-content">
          <div class="event-date">${formatDate(event.date)}</div>
          <h3 class="event-title">${escapeHtml(event.title)}</h3>
          <p class="event-location">${escapeHtml(event.location)}</p>
          <div class="event-sessions">
            ${event.sessions.map((session) => {
              const isFull = session.registered >= session.maxParticipants;
              const percentage = session.maxParticipants ? (session.registered / session.maxParticipants) * 100 : 0;
              return `
                <div class="session-row ${isFull ? 'full' : ''}">
                  <div class="session-info">
                    <span class="session-time">${escapeHtml(session.startTime)} - ${escapeHtml(session.endTime)}</span>
                    <span class="session-type">${escapeHtml(session.exerciseType)}</span>
                    ${getSessionPriceLabel(event, session) ? `<span style="display:block;margin-top:4px;font-size:0.85rem;opacity:0.9;">${getSessionPriceLabel(event, session)}</span>` : ''}
                  </div>
                  <div class="session-capacity">
                    <div class="capacity-bar"><div class="capacity-fill ${isFull ? 'full' : ''}" style="width:${percentage}%"></div></div>
                    <span class="capacity-text">${session.registered}/${session.maxParticipants}</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </article>`;
  }).join('');

  bindEventLaunchers(container.querySelectorAll('.event-card'));
}

function renderCalendar() {
  const container = document.getElementById('calendar-grid');
  if (!container) return;

  const upcomingEvents = getUpcomingEvents();
  container.innerHTML = upcomingEvents.map((event) => {
    const date = new Date(event.date);
    const totalSpots = event.sessions.reduce((sum, session) => sum + session.maxParticipants, 0);
    const totalRegistered = event.sessions.reduce((sum, session) => sum + session.registered, 0);
    const availableSpots = totalSpots - totalRegistered;

    let statusClass = 'available';
    let statusText = 'Open';
    if (availableSpots <= 0) {
      statusClass = 'sold-out';
      statusText = 'Sold Out';
    } else if (availableSpots < 10) {
      statusClass = 'limited';
      statusText = 'Limited';
    }

    return `
      <div class="calendar-item" tabindex="0" data-event-id="${escapeAttr(event.id)}">
        <div class="calendar-date">
          <span class="day">${date.getDate()}</span>
          <span class="month">${date.toLocaleString('default', { month: 'short' })}</span>
        </div>
        <div class="calendar-info">
          <h4>${escapeHtml(event.title)}</h4>
          <p>${escapeHtml(event.location)}</p>
        </div>
        <span class="calendar-status ${statusClass}">${statusText}</span>
      </div>`;
  }).join('');

  bindEventLaunchers(container.querySelectorAll('.calendar-item'));
}

function bindEventLaunchers(nodes) {
  nodes.forEach((node) => {
    const open = () => {
      state.lastTriggerEl = node;
      openEventModal(node.dataset.eventId);
    };
    node.addEventListener('click', open);
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
  });
}

function openEventModal(eventId) {
  const event = state.events.find((item) => item.id === eventId);
  if (!event) return;
  state.currentEvent = event;
  state.selectedSessionId = null;

  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  content.innerHTML = renderEventModal(event);

  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  bindModalActions();
  setTimeout(() => document.getElementById('modalClose').focus(), 20);
}

function renderEventModal(event) {
  return `
    <div class="modal-header">
      <h2 id="modalTitle">${escapeHtml(event.title)}</h2>
      <p>${formatDate(event.date)} · ${escapeHtml(event.location)}</p>
      ${event.description ? `<p style="margin-top:8px;">${escapeHtml(event.description)}</p>` : ''}
    </div>
    <div class="modal-sessions" role="list">
      ${event.sessions.map((session) => {
        const isFull = session.registered >= session.maxParticipants;
        const available = Math.max(0, session.maxParticipants - session.registered);
        const priceLabel = getSessionPriceLabel(event, session);
        return `
          <div class="modal-session ${isFull ? 'full' : ''}" role="listitem">
            <div class="modal-session-info">
              <h4>${escapeHtml(session.title)}</h4>
              <p>${escapeHtml(session.startTime)} - ${escapeHtml(session.endTime)} · ${escapeHtml(session.exerciseType)}</p>
              ${priceLabel ? `<p class="modal-price">${priceLabel}</p>` : ''}
            </div>
            <div class="modal-session-capacity">
              <div class="spots ${isFull ? 'full' : ''}">${available}</div>
              <div class="label">${isFull ? 'Full' : 'spots left'}</div>
            </div>
            <button class="btn-register" data-session-id="${escapeAttr(session.id)}" ${isFull ? 'disabled' : ''}>${isFull ? 'Full' : 'Register'}</button>
          </div>`;
      }).join('')}
    </div>
    <div id="registrationFormMount"></div>`;
}

function bindModalActions() {
  document.querySelectorAll('.btn-register[data-session-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedSessionId = button.dataset.sessionId;
      renderRegistrationForm();
    });
  });
}

function renderRegistrationForm() {
  const mount = document.getElementById('registrationFormMount');
  const event = state.currentEvent;
  const session = event?.sessions.find((item) => item.id === state.selectedSessionId);
  if (!mount || !event || !session) return;

  const authBanner = state.user
    ? `<div class="auth-registration-banner logged-in"><strong>Signed in as ${escapeHtml(getUserDisplayName())}</strong><br>We prefilled your saved account details below. You can still adjust anything for this registration.</div>`
    : `<div class="auth-registration-banner">Want faster bookings next time? <button type="button" class="auth-inline-btn" id="openAuthFromRegistration">Create an account or log in</button>.</div>`;

  mount.innerHTML = `
    <div class="registration-panel">
      <div class="registration-panel-header">
        <h3>Register for ${escapeHtml(session.title)}</h3>
        <p>${escapeHtml(session.startTime)} - ${escapeHtml(session.endTime)} · ${escapeHtml(session.exerciseType)}</p>
        ${getSessionPriceLabel(event, session) ? `<p class="modal-price">${getSessionPriceLabel(event, session)}</p>` : ''}
      </div>
      ${authBanner}
      <form id="sessionRegistrationForm" class="registration-form-grid">
        <div class="form-group">
          <label for="regFullName">Full name *</label>
          <input id="regFullName" name="full_name" type="text" required autocomplete="name" />
        </div>
        <div class="form-group">
          <label for="regEmail">Email *</label>
          <input id="regEmail" name="email" type="email" required autocomplete="email" />
        </div>
        <div class="form-group">
          <label for="regPhone">Phone number *</label>
          <input id="regPhone" name="phone" type="tel" required autocomplete="tel" />
        </div>
        <div class="form-group">
          <label for="regAge">Age *</label>
          <input id="regAge" name="age" type="number" min="1" max="120" required inputmode="numeric" />
        </div>
        <div class="form-group">
          <label for="regGender">Gender *</label>
          <select id="regGender" name="gender" required>
            ${buildGenderOptionsHtml('', true)}
          </select>
        </div>
        <div class="form-group form-group-full">
          <label for="regAllergies">Food allergies</label>
          <textarea id="regAllergies" name="food_allergies" rows="3" placeholder="List any allergies or write none."></textarea>
        </div>
        <div class="form-group form-group-full">
          <label for="regMedical">Medical / physical conditions we should know about</label>
          <textarea id="regMedical" name="medical_conditions" rows="3" placeholder="Share anything relevant for training safety."></textarea>
        </div>
        <div class="form-group">
          <label for="regEmergencyName">Emergency contact name *</label>
          <input id="regEmergencyName" name="emergency_contact_name" type="text" required autocomplete="name" />
        </div>
        <div class="form-group">
          <label for="regEmergencyPhone">Emergency contact phone *</label>
          <input id="regEmergencyPhone" name="emergency_contact_phone" type="tel" required autocomplete="tel" />
        </div>
        <label class="checkbox-row form-group-full">
          <input id="regConsent" name="consent_given" type="checkbox" required />
          <span>I agree that Fitness Truck may store my information to manage my participation safely.</span>
        </label>
        <label class="checkbox-row form-group-full">
          <input id="regWaiver" name="waiver_accepted" type="checkbox" required />
          <span>I understand this is a physical activity event and I participate at my own responsibility.</span>
        </label>
        <div class="registration-actions form-group-full">
          <button type="submit" class="btn btn-primary">Complete registration</button>
          <button type="button" class="btn btn-secondary" id="cancelRegistrationBtn">Cancel</button>
        </div>
      </form>
      <p class="registration-note">After your registration is saved, we will also try to send a confirmation email.</p>
    </div>`;

  const form = document.getElementById('sessionRegistrationForm');
  form.addEventListener('submit', submitRegistrationForm);
  populateRegistrationFormFromUser(form);

  document.getElementById('openAuthFromRegistration')?.addEventListener('click', () => openAuthModal('signup', document.getElementById('openAuthFromRegistration')));
  document.getElementById('cancelRegistrationBtn').addEventListener('click', () => {
    state.selectedSessionId = null;
    mount.innerHTML = '';
  });
  document.getElementById('regFullName').focus();
}

async function submitRegistrationForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const payload = {
    p_session_id: state.selectedSessionId,
    p_email: String(formData.get('email') || '').trim().toLowerCase(),
    p_full_name: String(formData.get('full_name') || '').trim(),
    p_phone: String(formData.get('phone') || '').trim(),
    p_age: Number(formData.get('age')),
    p_gender: normalizeGenderValue(formData.get('gender')),
    p_food_allergies: String(formData.get('food_allergies') || '').trim(),
    p_medical_conditions: String(formData.get('medical_conditions') || '').trim(),
    p_emergency_contact_name: String(formData.get('emergency_contact_name') || '').trim(),
    p_emergency_contact_phone: String(formData.get('emergency_contact_phone') || '').trim(),
    p_consent_given: formData.get('consent_given') === 'on',
    p_waiver_accepted: formData.get('waiver_accepted') === 'on'
  };

  if (!payload.p_email || !payload.p_full_name || !payload.p_phone || !payload.p_age || !payload.p_gender || !payload.p_emergency_contact_name || !payload.p_emergency_contact_phone || !payload.p_consent_given || !payload.p_waiver_accepted) {
    showToast('Please complete all required fields.', 'error');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Saving...';

  try {
    const { data, error } = await supabaseClient.rpc('register_for_session', payload);
    if (error) throw error;
    if (!data?.success) {
      showToast(data?.message || 'Registration failed.', 'error');
      submitButton.disabled = false;
      submitButton.textContent = 'Complete registration';
      return;
    }

    let emailSent = false;
    try {
      const emailResponse = await fetch('/.netlify/functions/send-registration-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant: {
            fullName: payload.p_full_name,
            email: payload.p_email,
            phone: payload.p_phone,
            age: payload.p_age,
            gender: payload.p_gender,
            foodAllergies: payload.p_food_allergies,
            medicalConditions: payload.p_medical_conditions,
            emergencyContactName: payload.p_emergency_contact_name,
            emergencyContactPhone: payload.p_emergency_contact_phone
          },
          event: {
            id: state.currentEvent.id,
            title: state.currentEvent.title,
            date: state.currentEvent.date,
            location: state.currentEvent.location
          },
          session: {
            id: sessionIdFromState(),
            title: state.currentEvent.sessions.find((item) => item.id === state.selectedSessionId)?.title || '',
            startTime: state.currentEvent.sessions.find((item) => item.id === state.selectedSessionId)?.startTime || '',
            endTime: state.currentEvent.sessions.find((item) => item.id === state.selectedSessionId)?.endTime || '',
            exerciseType: state.currentEvent.sessions.find((item) => item.id === state.selectedSessionId)?.exerciseType || '',
            priceChf: state.currentEvent.sessions.find((item) => item.id === state.selectedSessionId)?.priceChf ?? state.currentEvent.basePriceChf ?? 0
          }
        })
      });

      if (emailResponse.ok) {
        const emailJson = await emailResponse.json();
        emailSent = !!emailJson.success;
      }
    } catch (emailError) {
      console.error('Confirmation email error:', emailError);
    }

    showToast(emailSent ? 'Registration saved and confirmation email sent.' : 'Registration saved. Confirmation email could not be sent yet.', emailSent ? 'success' : 'error');
    await loadEvents();
    if (state.user) await loadMyRegistrations({ force: true });
    closeModal();
  } catch (error) {
    console.error('Registration error:', error);
    showToast(error.message || 'Registration failed.', 'error');
    submitButton.disabled = false;
    submitButton.textContent = 'Complete registration';
  }
}

function getSessionPriceLabel(event, session) {
  const sessionPrice = Number(session?.priceChf || 0);
  const eventPrice = Number(event?.basePriceChf || 0);
  const price = sessionPrice > 0 ? sessionPrice : eventPrice;

  return price > 0 ? `CHF ${price.toFixed(2)}` : '';
}

function sessionIdFromState() {
  return state.selectedSessionId || '';
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  state.currentEvent = null;
  state.selectedSessionId = null;
  if (state.lastTriggerEl) state.lastTriggerEl.focus();
}

function initForms() {
  const contactForm = document.getElementById('contactForm');
  [contactForm].forEach((form) => {
    if (!form) return;
    form.addEventListener('submit', () => {
      const button = form.querySelector('button[type="submit"]') || form.querySelector('.btn-submit');
      if (button) {
        button.disabled = true;
        button.textContent = 'Sending...';
      }
    });
  });
}

function initNavigation() {
  const navbar = document.getElementById('navbar');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const navLinks = document.getElementById('navLinks');

  window.addEventListener('scroll', () => {
    if (window.pageYOffset > 100) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  });

  if (mobileMenuBtn && navLinks) {
    mobileMenuBtn.addEventListener('click', () => {
      const isExpanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
      mobileMenuBtn.setAttribute('aria-expanded', String(!isExpanded));
      navLinks.classList.toggle('active');
      document.body.style.overflow = isExpanded ? '' : 'hidden';
    });

    document.addEventListener('click', (event) => {
      const menuOpen = navLinks.classList.contains('active');
      if (!menuOpen) return;
      const clickedInsideMenu = navLinks.contains(event.target);
      const clickedButton = mobileMenuBtn.contains(event.target);
      if (!clickedInsideMenu && !clickedButton) {
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        navLinks.classList.remove('active');
        document.body.style.overflow = '';
      }
    });

    navLinks.querySelectorAll('a, button').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        navLinks.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  bindAuthLaunchers(document);

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (event) {
      const href = this.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      const offsetTop = target.offsetTop - 80;
      window.scrollTo({ top: offsetTop, behavior: 'smooth' });
    });
  });
}

function initModal() {
  const overlay = document.getElementById('modalOverlay');
  const closeBtn = document.getElementById('modalClose');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (overlay) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
  }

  document.addEventListener('keydown', (event) => {
    const isOpen = overlay && overlay.getAttribute('aria-hidden') === 'false';
    if (event.key === 'Escape' && isOpen) closeModal();
    if (event.key === 'Tab' && isOpen) {
      const focusable = overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
}

function setupAnimationObserver() {
  if (state.animationsInitialized) return;
  state.animationsInitialized = true;
  state.animationObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
}

function observeAnimatable() {
  setupAnimationObserver();
  document.querySelectorAll('.process-card, .team-card, .event-card, .expect-card, .feature-item, .calendar-item').forEach((element) => {
    if (!element.classList.contains('animate-in')) state.animationObserver.observe(element);
  });
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}
function escapeAttr(text) { return escapeHtml(String(text ?? '')).replace(/"/g, '&quot;'); }

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<div class="toast-icon">${type === 'success' ? '✓' : '!'}</div><div class="toast-message">${escapeHtml(message)}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initModal();
  initForms();
  initAuth();
  await loadEvents();
});
