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
  animationsInitialized: false
};

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

  mount.innerHTML = `
    <div class="registration-panel">
      <div class="registration-panel-header">
        <h3>Register for ${escapeHtml(session.title)}</h3>
        <p>${escapeHtml(session.startTime)} - ${escapeHtml(session.endTime)} · ${escapeHtml(session.exerciseType)}</p>
        ${getSessionPriceLabel(event, session) ? `<p class="modal-price">${getSessionPriceLabel(event, session)}</p>` : ''}
      </div>
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
          <input id="regEmergencyName" name="emergency_contact_name" type="text" required />
        </div>
        <div class="form-group">
          <label for="regEmergencyPhone">Emergency contact phone *</label>
          <input id="regEmergencyPhone" name="emergency_contact_phone" type="tel" required />
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
  const price = session.priceChf ?? event.basePriceChf;
  return price && Number(price) > 0 ? `CHF ${Number(price).toFixed(2)}` : '';
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
  const newsletterForm = document.getElementById('newsletterForm');
  [contactForm, newsletterForm].forEach((form) => {
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

    navLinks.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        navLinks.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

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
  await loadEvents();
});
