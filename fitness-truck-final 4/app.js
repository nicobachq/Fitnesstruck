// ============================================
// FITNESS TRUCK - Main Application (Supabase + Full Registration)
// ============================================

const CONFIG = {
  DEMO_MODE: false,
  SUPABASE_URL: 'https://xqmwipogfcfjmqsiqdbu.supabase.co',
  SUPABASE_KEY: 'sb_publishable_acr4jKu8IG-THTIn40q3eA_uOiEaOCj'
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
  lastAuthTriggerEl: null
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

function openAuthModal(view = 'login', triggerEl = document.activeElement) {
  state.authView = view === 'signup' ? 'signup' : 'login';
  state.lastAuthTriggerEl = triggerEl || null;
  renderAuthModal();
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
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

function renderAuthModal() {
  const mount = document.getElementById('authModalContent');
  if (!mount) return;

  if (state.user) {
    mount.innerHTML = `
      <div class="auth-card">
        <span class="auth-status-pill">Signed in</span>
        <div>
          <h2 class="auth-title" id="authModalTitle">Your account</h2>
          <p class="auth-muted">Your details can now be reused when you register for a session.</p>
        </div>
        <div class="auth-summary-grid">
          <div class="auth-summary-item">
            <strong>Name</strong>
            <span>${escapeHtml(getUserDisplayName())}</span>
          </div>
          <div class="auth-summary-item">
            <strong>Email</strong>
            <span>${escapeHtml(state.user.email || '')}</span>
          </div>
          <div class="auth-summary-item">
            <strong>Phone</strong>
            <span>${escapeHtml(getUserPhone() || 'Not saved yet')}</span>
          </div>
          <div class="auth-summary-item">
            <strong>News updates</strong>
            <span>${getUserMetadata().marketing_opt_in ? 'Subscribed' : 'Not subscribed'}</span>
          </div>
        </div>
        <div class="auth-actions">
          <button type="button" class="btn btn-primary" id="closeAuthAndBrowseBtn">Continue booking</button>
          <button type="button" class="btn btn-secondary" id="logoutAccountBtn">Log out</button>
        </div>
      </div>`;

    document.getElementById('closeAuthAndBrowseBtn')?.addEventListener('click', closeAuthModal);
    document.getElementById('logoutAccountBtn')?.addEventListener('click', logoutCurrentUser);
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
          <div class="form-group form-checkbox-group">
            <label class="checkbox-row auth-checkbox-row" for="signupMarketingOptIn">
              <input id="signupMarketingOptIn" name="marketing_opt_in" type="checkbox" />
              <span>Email me news, early access, and event updates.</span>
            </label>
            <p class="auth-optin-note">Optional and separate from your account login.</p>
          </div>
          <button type="submit" class="btn btn-primary">Create account</button>
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
    updateAccountButton();
    populateRegistrationFormFromUser(document.getElementById('sessionRegistrationForm'));
    showToast('You are now logged in.', 'success');
    closeAuthModal();
  } catch (error) {
    console.error('Login error:', error);
    showToast(error.message || 'Login failed.', 'error');
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
  const marketingOptIn = formData.get('marketing_opt_in') === 'on';

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
      updateAccountButton();
      populateRegistrationFormFromUser(document.getElementById('sessionRegistrationForm'));
      showToast('Account created and you are now logged in.', 'success');
      closeAuthModal();
      return;
    }

    state.authView = 'login';
    renderAuthModal();
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;
    showToast('Account created. Please confirm your email, then log in.', 'success');
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
    updateAccountButton();
    renderAuthModal();
    showToast('You are now logged out.', 'success');
  } catch (error) {
    console.error('Logout error:', error);
    showToast(error.message || 'Logout failed.', 'error');
  }
}

function populateRegistrationFormFromUser(form) {
  if (!form || !state.user) return;
  const metadata = getUserMetadata();
  const fields = {
    full_name: String(metadata.full_name || '').trim(),
    email: String(state.user.email || '').trim().toLowerCase(),
    phone: String(metadata.phone || '').trim()
  };

  Object.entries(fields).forEach(([name, value]) => {
    if (!value) return;
    const input = form.elements.namedItem(name);
    if (input && !String(input.value || '').trim()) input.value = value;
  });
}

function initAuth() {
  updateAccountButton();

  document.getElementById('accountBtn')?.addEventListener('click', (event) => {
    const navLinks = document.getElementById('navLinks');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (navLinks?.classList.contains('active')) {
      navLinks.classList.remove('active');
      mobileMenuBtn?.setAttribute('aria-expanded', 'false');
    }
    openAuthModal(state.user ? 'login' : 'login', event.currentTarget);
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

  supabaseClient.auth.getUser().then(({ data, error }) => {
    if (error) {
      console.error('Auth state load error:', error);
      return;
    }
    state.user = data.user || null;
    updateAccountButton();
  });

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    state.user = session?.user || null;
    updateAccountButton();
    if (document.getElementById('authOverlay')?.getAttribute('aria-hidden') === 'false') renderAuthModal();
    populateRegistrationFormFromUser(document.getElementById('sessionRegistrationForm'));
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
    ? `<div class="auth-registration-banner logged-in"><strong>Signed in as ${escapeHtml(getUserDisplayName())}</strong><br>We prefilled your name, email, and phone below. You can still adjust them for this registration.</div>`
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
    p_food_allergies: String(formData.get('food_allergies') || '').trim(),
    p_medical_conditions: String(formData.get('medical_conditions') || '').trim(),
    p_emergency_contact_name: String(formData.get('emergency_contact_name') || '').trim(),
    p_emergency_contact_phone: String(formData.get('emergency_contact_phone') || '').trim(),
    p_consent_given: formData.get('consent_given') === 'on',
    p_waiver_accepted: formData.get('waiver_accepted') === 'on'
  };

  if (!payload.p_email || !payload.p_full_name || !payload.p_phone || !payload.p_age || !payload.p_emergency_contact_name || !payload.p_emergency_contact_phone || !payload.p_consent_given || !payload.p_waiver_accepted) {
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

  document.querySelectorAll('[data-open-auth]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const view = button.dataset.openAuth === 'signup' ? 'signup' : 'login';
      openAuthModal(view, event.currentTarget);
    });
  });

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
