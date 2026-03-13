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
  myRegistrationsForEmail: '',
  claimRegistrationsStatus: 'idle',
  claimRegistrationsForEmail: '',
  claimRegistrationsCount: 0,
  visiblePastRegistrations: 5,
  eventsLoaded: false,
  paymentReturn: null,
  paymentReturnNotice: null,
  language: (() => {
    try {
      const saved = localStorage.getItem('ft_lang');
      return saved === 'en' ? 'en' : 'it';
    } catch (error) {
      return 'it';
    }
  })()
};


function isAccountPage() {
  return document.body?.dataset?.page === 'account' || /\/account\.html(?:$|[?#])/i.test(window.location.pathname + window.location.search + window.location.hash);
}

function getRequestedAuthView() {
  try {
    const value = new URLSearchParams(window.location.search).get('view');
    return value === 'signup' ? 'signup' : 'login';
  } catch (error) {
    return 'login';
  }
}

function buildAccountPageUrl(view = 'login') {
  const target = new URL('account.html', window.location.href);
  target.searchParams.set('view', view === 'signup' ? 'signup' : 'login');
  return `${target.pathname}${target.search}`;
}

function goToAccountPage(view = 'login') {
  window.location.href = buildAccountPageUrl(view);
}

const OPEN_EVENT_STORAGE_KEY = 'ft_open_event_id';

function buildEventOpenUrl(eventId = '') {
  const normalizedId = String(eventId || '').trim();
  const target = new URL('/', window.location.origin);
  if (normalizedId) target.searchParams.set('openEvent', normalizedId);
  target.hash = 'events';
  return `${target.pathname}${target.search}${target.hash}`;
}

function queueRequestedEventId(eventId = '') {
  const normalizedId = String(eventId || '').trim();
  if (!normalizedId) return;
  try {
    window.localStorage.setItem(OPEN_EVENT_STORAGE_KEY, normalizedId);
  } catch (error) {
    // noop
  }
}

function getRequestedEventIdFromUrl() {
  if (isAccountPage()) return '';
  try {
    return String(new URLSearchParams(window.location.search).get('openEvent') || '').trim();
  } catch (error) {
    return '';
  }
}

function getQueuedRequestedEventId() {
  if (isAccountPage()) return '';
  try {
    return String(window.localStorage.getItem(OPEN_EVENT_STORAGE_KEY) || '').trim();
  } catch (error) {
    return '';
  }
}

function clearRequestedEventIdFromUrl() {
  if (isAccountPage()) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('openEvent');
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  } catch (error) {
    // noop
  }
}

function clearQueuedRequestedEventId() {
  try {
    window.localStorage.removeItem(OPEN_EVENT_STORAGE_KEY);
  } catch (error) {
    // noop
  }
}

function getAccountPaymentReturnFromUrl() {
  if (!isAccountPage()) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const status = String(params.get('payment') || '').trim().toLowerCase();
    const ref = String(params.get('ref') || '').trim();
    if (!status) return null;
    if (!['success', 'failed', 'cancel'].includes(status)) return null;
    return {
      status,
      ref,
      handled: false,
      inProgress: false
    };
  } catch (error) {
    return null;
  }
}

function clearAccountPaymentReturnFromUrl() {
  if (!isAccountPage()) return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('payment');
    url.searchParams.delete('ref');
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  } catch (error) {
    // noop
  }
}

function hasRecentRegistration(minutes = 10) {
  const thresholdMs = Math.max(1, Number(minutes) || 10) * 60 * 1000;
  const now = Date.now();
  return (state.myRegistrations || []).some((item) => {
    const createdAt = Date.parse(item.created_at || '');
    return Number.isFinite(createdAt) && (now - createdAt) >= 0 && (now - createdAt) <= thresholdMs;
  });
}


function mergeRegistrationIntoAccount(registration) {
  if (!registration || !registration.registration_id) return false;

  const normalized = normalizeMyRegistrationItem(registration);
  const currentItems = Array.isArray(state.myRegistrations) ? [...state.myRegistrations] : [];
  const existingIndex = currentItems.findIndex((item) => String(item.registration_id || '') === normalized.registration_id);

  if (existingIndex >= 0) {
    currentItems[existingIndex] = { ...currentItems[existingIndex], ...normalized };
  } else {
    currentItems.unshift(normalized);
  }

  currentItems.sort((left, right) => {
    const leftTime = Date.parse(left.created_at || '') || 0;
    const rightTime = Date.parse(right.created_at || '') || 0;
    return rightTime - leftTime;
  });

  state.myRegistrations = currentItems;
  state.visiblePastRegistrations = 5;
  state.myRegistrationsStatus = 'success';
  state.myRegistrationsError = '';
  state.myRegistrationsForEmail = String(state.user?.email || '').trim().toLowerCase();
  return true;
}

async function fetchPaymentRegistrationByReference(referenceId = '') {
  const ref = String(referenceId || '').trim();
  if (!ref) return null;

  const response = await fetch(`/.netlify/functions/get-payment-registration?ref=${encodeURIComponent(ref)}`, {
    headers: { Accept: 'application/json' }
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (response.status === 202) return null;
  if (!response.ok) {
    const message = payload?.message || `Could not load payment booking (${response.status})`;
    throw new Error(message);
  }

  return payload?.booking ? normalizeMyRegistrationItem(payload.booking) : null;
}

function getPaymentReturnMessage(status, synced = false) {
  if (status === 'success') {
    return synced ? t('account.paymentSynced') : t('account.paymentPendingRefresh');
  }
  if (status === 'failed') return t('account.paymentFailed');
  if (status === 'cancel') return t('account.paymentCancelled');
  return '';
}

async function handleAccountPaymentReturn() {
  if (!isAccountPage() || !state.paymentReturn || state.paymentReturn.handled || state.paymentReturn.inProgress) return;

  const paymentState = state.paymentReturn;

  if (paymentState.status === 'failed' || paymentState.status === 'cancel') {
    const message = getPaymentReturnMessage(paymentState.status, false);
    state.paymentReturnNotice = { type: 'info', message };
    renderAuthModal();
    showToast(message, paymentState.status === 'failed' ? 'error' : 'success');
    paymentState.handled = true;
    setTimeout(clearAccountPaymentReturnFromUrl, 1200);
    return;
  }

  if (!state.user) return;

  paymentState.inProgress = true;
  const baselineCount = Array.isArray(state.myRegistrations) ? state.myRegistrations.length : 0;
  const pendingMessage = getPaymentReturnMessage('success', false);
  state.paymentReturnNotice = { type: 'success', message: pendingMessage };
  renderAuthModal();
  showToast(pendingMessage, 'success');

  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      await loadEvents();
      await loadMyRegistrations({ force: true });
    } catch (error) {
      console.error('Payment return sync error:', error);
    }

    renderAuthModal();

    let hasSyncedRegistration = state.myRegistrations.length > baselineCount || hasRecentRegistration(10);
    if (!hasSyncedRegistration && paymentState.ref) {
      try {
        const paymentBooking = await fetchPaymentRegistrationByReference(paymentState.ref);
        if (paymentBooking) {
          mergeRegistrationIntoAccount(paymentBooking);
          hasSyncedRegistration = true;
        }
      } catch (error) {
        console.error('Payment booking fetch error:', error);
      }
    }

    if (hasSyncedRegistration) {
      const successMessage = getPaymentReturnMessage('success', true);
      state.paymentReturnNotice = { type: 'success', message: successMessage };
      renderAuthModal();
      showToast(successMessage, 'success');
      paymentState.handled = true;
      paymentState.inProgress = false;
      setTimeout(clearAccountPaymentReturnFromUrl, 1200);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  if (paymentState.ref) {
    try {
      const paymentBooking = await fetchPaymentRegistrationByReference(paymentState.ref);
      if (paymentBooking) {
        mergeRegistrationIntoAccount(paymentBooking);
        const successMessage = getPaymentReturnMessage('success', true);
        state.paymentReturnNotice = { type: 'success', message: successMessage };
      }
    } catch (error) {
      console.error('Final payment booking fetch error:', error);
    }
  }

  paymentState.inProgress = false;
  paymentState.handled = true;
  renderAuthModal();
  setTimeout(clearAccountPaymentReturnFromUrl, 1200);
}


const TRANSLATIONS = {
  it: {
    meta: {
      title: 'Fitness Truck | La palestra che si muove',
      description: 'Esperienze fitness outdoor premium in Ticino. Coaching professionale, attrezzatura top, location straordinarie e una community che si muove.'
    },
    nav: {
      events: 'Eventi',
      experience: 'Esperienza',
      team: 'Team',
      contact: 'Contatti',
      account: 'Account',
      myAccount: 'Il mio account',
      openAccount: 'Apri account',
      openAccountFor: 'Apri l\'account di {name}',
      home: 'Home'
    },
    common: {
      selectOne: 'Seleziona',
      notSavedYet: 'Non ancora salvato',
      nothingSavedYet: 'Nessuna informazione salvata',
      priceNotSet: 'Prezzo non ancora impostato',
      event: 'Evento',
      session: 'Sessione',
      locationTbd: 'Luogo da confermare',
      timeTbd: 'Orario da confermare',
      experience: 'Esperienza',
      save: 'Salva',
      cancel: 'Annulla',
      loading: 'Caricamento…',
      retry: 'Riprova'
    },
    gender: {
      male: 'Uomo',
      female: 'Donna',
      other: 'Altro',
      prefer_not_to_say: 'Preferisco non dirlo',
      chooseLater: 'Preferisco scegliere più tardi',
      notSavedYet: 'Genere non ancora salvato'
    },
    hero: {
      badge: 'Esperienze fitness outdoor in Ticino',
      subtitle: 'Esperienze fitness outdoor premium in location straordinarie del Ticino. Coaching professionale, attrezzatura top e un\'atmosfera che ti fa uscire dalla routine.',
      statValue1: 'Mixed',
      statStops: 'Livelli benvenuti',
      statValue2: 'Gear',
      statSpots: 'Attrezzatura inclusa',
      statValue3: 'Ticino',
      statEvents: 'Punto di partenza',
      viewUpcoming: 'Vedi eventi',
      createAccount: 'Crea account',
      lugano: 'Lugano',
      monteBar: 'Monte Bar',
      lakeSessions: 'Sessioni sul lago',
      ticinoEnergy: 'Energia ticinese',
      scroll: 'Scorri per scoprire',
      signedIn: 'Connesso',
      welcomeBack: 'Bentornato, {name}',
      accountActive: 'Il tuo account è attivo. Esplora il calendario oppure apri i tuoi dettagli quando vuoi.',
      viewSchedule: 'Vedi calendario',
      nextEvent: 'Prossimo evento',
      nextEventDesc: 'Sei connesso. Ecco il prossimo evento che puoi prenotare subito.',
      sessions: 'Sessioni',
      availableSessions: '{count} sessioni disponibili',
      availableSession: '{count} sessione disponibile',
      availability: 'Disponibilità',
      availabilityText: '{remaining} posti su {total} ancora liberi',
      viewNextEvent: 'Apri evento',
      myAccount: 'Il mio account',
      accountCardLabel: 'Account',
      accountCardTitle: 'Crea il tuo account',
      accountCardDesc: 'Crea il tuo account per registrarti e pagare gli eventi. I tuoi dati restano salvati per le prenotazioni future.',
      fasterBookings: 'Prenotazioni future più veloci',
      newsOptIn: 'Aggiornamenti eventi facoltativi',
      guestBooking: 'Account richiesto per registrarti e pagare'
    },
    events: {
      sectionEyebrow: 'Prossimi eventi',
      sectionTitleHtml: 'Trova il tuo prossimo <span class="text-accent">evento</span>',
      sectionDesc: 'Eventi outdoor premium in Ticino con posti limitati, coaching esperto e location che valgono il viaggio. Gli eventi chiusi restano visibili, ma si aprono solo quando sono confermati.',
      emptyTitle: 'Nessun evento in arrivo',
      emptyDesc: 'La prossima experience sta prendendo forma. Crea il tuo account per essere pronto quando apriamo nuove date e registrazioni.',
      emptyCta: 'Crea account',
      calendarTitle: 'Calendario in arrivo',
      soldOut: 'Completo',
      almostFull: 'Quasi completo',
      open: 'Aperto',
      limited: 'Limitato',
      closed: 'Chiuso',
      joining_one: '{count} partecipante',
      joining_other: '{count} partecipanti',
      sessionsLabel_one: '{count} sessione',
      sessionsLabel_other: '{count} sessioni',
      equipmentIncluded: 'Attrezzatura inclusa',
      defaultSummary: 'Coaching professionale, attrezzatura premium e una community che si muove.',
      openCardDesc: 'Registrazioni aperte ora',
      soldOutCardDesc: 'Evento visibile ma al completo',
      closedCardDesc: 'Evento visibile ma non ancora prenotabile',
      viewDetails: 'Vedi dettagli',
      modalLogisticsTitle: 'Prima di arrivare',
      modalLogisticsDesc: 'Porta outfit adeguato e strati caldi se serve. Noi portiamo l\'attrezzatura e ti aggiorniamo se meteo o logistica richiedono cambiamenti.',
      modalMixedLevels: 'Livelli misti',
      modalWeather: 'Aggiornamenti meteo inclusi',
      modalAccountRequired: 'Account richiesto per prenotare'
    },
    experience: {
      eyebrow: 'Come partecipare',
      titleHtml: 'Semplice, chiaro, <span class="text-accent">premium</span>',
      desc: 'Dal primo click all\'arrivo sul posto, tutto deve essere lineare e facile da capire.',
      step1Title: 'Scegli l\'evento giusto',
      step1Desc: 'Guarda date, location, stato e disponibilità. Ogni evento è pensato come un\'esperienza, non come una semplice lezione.',
      step2Title: 'Crea account e prenota',
      step2Desc: 'L\'account serve per registrarti e pagare in modo ordinato. I tuoi dati restano salvati per velocizzare le prossime prenotazioni.',
      step3Title: 'Presentati pronto',
      step3Desc: 'Arrivi con outfit adatto, noi portiamo truck, attrezzatura, coaching e l\'energia del gruppo. Se il meteo richiede cambiamenti, ti aggiorniamo in anticipo.'
    },
    expect: {
      eyebrow: 'Cosa aspettarti',
      titleHtml: 'Più di un <span class="text-accent">allenamento</span>',
      desc: 'Ogni experience unisce qualità del training, atmosfera, natura e nuove motivazioni.',
      feature1: 'Forza funzionale',
      feature2: 'Mobilità e recupero',
      feature3: 'Community motivante',
      feature4: 'Outdoor experience',
      feature5: 'Coaching esperto',
      feature6: 'Attrezzatura premium',
      photo1: 'Energia reale',
      photo2: 'Coaching preciso',
      photo3: 'Location memorabili',
      card1Title: 'Allenamento che ti riaccende',
      card1Desc: 'Sessioni abbastanza intense da darti stimolo, ma progettate per restare accessibili a livelli misti e farti venire voglia di tornare.',
      card2Title: 'Qualità che si percepisce',
      card2Desc: 'Non stai entrando in un contesto improvvisato. Stai entrando in un\'esperienza curata, con attenzione al luogo, alle persone e al modo in cui ti fa sentire.'
    },
    concept: {
      eyebrow: 'Perché Fitness Truck',
      titleHtml: 'Allenarsi bene, <span class="text-accent">fuori dal solito</span>',
      desc: 'Fitness Truck porta l\'energia del training di qualità in luoghi che cambiano prospettiva. Non sostituisce la palestra: ti dà un motivo nuovo per muoverti.',
      card1Title: 'Setup premium',
      card1Desc: 'Coaching professionale, attrezzatura top e sessioni progettate con cura. L\'esperienza deve sentirsi seria, pulita e ben organizzata.',
      card2Title: 'Location che cambiano',
      card2Desc: 'Montagna, lago, natura e contesti speciali. Ogni evento vuole farti uscire dalla monotonia e vivere l\'allenamento in modo diverso.',
      card3Title: 'Community che si muove',
      card3Desc: 'Piccoli gruppi, persone motivate, atmosfera positiva. Vieni per allenarti bene, resta per l\'energia condivisa.'
    },
    team: {
      eyebrow: 'Il team',
      titleHtml: 'Coaching con <span class="text-accent">visione</span>',
      desc: 'Fitness Truck nasce per unire qualità del coaching, benessere e senso dell\'esperienza in un format credibile e curato.',
      nicolasBio: 'Dà forma al concetto e all\'esperienza Fitness Truck, trasformando l\'allenamento in qualcosa che le persone si portano dietro anche dopo la sessione.',
      nazarenoBio: 'Porta struttura, intensità e profondità di coaching a ogni activation, aiutando le persone a muoversi meglio e ad allenarsi con uno scopo.',
      lorenzoBio: 'Sostiene recupero, resilienza e benessere fisico nel lungo periodo, aggiungendo un livello di cura ancora più profondo all\'esperienza.'
    },
    teaser: {
      eyebrow: 'Su richiesta',
      titleHtml: 'Anche per <span class="text-accent">team e gruppi privati</span>',
      desc: 'Stiamo aprendo anche a corporate wellness, team building, hotel partner e gruppi privati. Per ora lo gestiamo su richiesta, con format costruiti bene e location che fanno la differenza.',
      primaryCta: 'Scrivici',
      secondaryCta: 'Leggi le FAQ'
    },
    faq: {
      eyebrow: 'FAQ',
      titleHtml: 'Le domande più <span class="text-accent">importanti</span>',
      desc: 'Le basi per capire come funziona Fitness Truck prima di prenotare il tuo posto.',
      q1: 'Serve un account per prenotare?',
      a1: 'Sì. Puoi esplorare il sito liberamente, ma per registrarti a un evento e pagare serve un account Fitness Truck.',
      q2: 'L\'attrezzatura è inclusa?',
      a2: 'Sì. Noi portiamo l\'attrezzatura. Tu devi solo arrivare con outfit adeguato e con strati caldi se la temperatura lo richiede.',
      q3: 'Cosa succede se il meteo peggiora?',
      a3: 'Gli eventi si svolgono normalmente in condizioni outdoor gestibili. Se il meteo è davvero insicuro, possiamo posticipare, spostare o annullare l\'evento e avvisarti in anticipo.',
      q4: 'Posso cancellare la mia partecipazione?',
      a4: 'Sì. La cancellazione è gratuita fino a 48 ore prima dell\'evento. Dopo quel termine non è previsto rimborso, salvo cancellazione da parte di Fitness Truck.',
      fullCta: 'Apri FAQ complete',
      policyCta: 'Leggi condizioni e policy'
    },
    contact: {
      eyebrow: 'Contatti',
      titleHtml: 'Restiamo in <span class="text-accent">contatto</span>',
      desc: 'Domande, collaborazioni future o richieste per gruppi privati? Saremo felici di sentirti.',
      email: 'Email',
      phone: 'Telefono',
      instagram: 'Instagram',
      locations: 'Luoghi',
      locationsValue: 'Partiamo dal Ticino · visione Swiss-wide',
      formName: 'Il tuo nome',
      formEmail: 'La tua email',
      formMessage: 'Il tuo messaggio',
      formNamePlaceholder: 'Mario Rossi',
      formEmailPlaceholder: 'mario@example.com',
      formMessagePlaceholder: 'Raccontaci cosa stai cercando e ti ricontatteremo.',
      send: 'Invia messaggio',
      sending: 'Invio in corso...'
    },
    footer: {
      tagline: 'Esperienze outdoor premium, nate in Ticino.',
      faq: 'FAQ',
      privacy: 'Privacy',
      terms: 'Condizioni',
      admin: 'Admin',
      rights: '© 2026 Fitness Truck. Tutti i diritti riservati.',
      backToTop: 'Torna in alto'
    },
    account: {
      registrationsTitle: 'Le mie registrazioni',
      registrationsLoading: 'Stiamo caricando le sessioni che hai prenotato.',
      registrationsLoadingEmpty: 'Stiamo caricando le tue registrazioni…',
      registrationsErrorDesc: 'Le sessioni che hai prenotato appariranno qui non appena riusciremo a leggerle.',
      registrationsErrorEmpty: 'Non siamo ancora riusciti a caricare le tue registrazioni.',
      linkedBookingsToast_one: '{count} prenotazione precedente collegata al tuo account.',
      linkedBookingsToast_other: '{count} prenotazioni precedenti collegate al tuo account.',
      linkedBookingsHeader_one: 'Collegata {count} prenotazione precedente dalla tua email ospite.',
      linkedBookingsHeader_other: 'Collegate {count} prenotazioni precedenti dalla tua email ospite.',
      registrationsHeaderDefault: 'Vedi gli eventi che hai già prenotato con questo indirizzo email. Le vecchie prenotazioni ospite con la stessa email vengono collegate automaticamente.',
      paymentPendingRefresh: 'Pagamento ricevuto. Stiamo aggiornando le tue registrazioni…',
      paymentSynced: 'Registrazione confermata. Il tuo posto è stato aggiornato.',
      paymentFailed: 'Il pagamento non è andato a buon fine. Riprova quando vuoi.',
      paymentCancelled: 'Pagamento annullato. Nessun posto è stato prenotato.',
      total: '{count} totali',
      upcoming: 'In arrivo',
      past: 'Passati',
      recentHistoryOnly: 'Qui vedi solo lo storico recente. Il log completo delle tue partecipazioni resta in admin.',
      noUpcomingYet: 'Nessun evento in arrivo per ora.',
      noPastYet: 'I tuoi eventi recenti appariranno qui una volta che avrai partecipato.',
      upcomingEventKicker: 'Evento in arrivo',
      upcomingStatus: 'In arrivo',
      labelSession: 'Sessione',
      labelTime: 'Orario',
      labelType: 'Tipo',
      labelPrice: 'Prezzo',
      booked: 'Prenotato {value}',
      openEvent: 'Apri evento',
      loadMorePast: 'Carica altri {count} eventi passati',
      signedIn: 'Connesso',
      yourAccount: 'Il tuo account',
      summaryDesc: 'Questi dati salvati vengono riutilizzati automaticamente quando ti registri al prossimo evento.',
      editProfile: 'Modifica profilo',
      continueBooking: 'Continua a prenotare',
      logOut: 'Esci',
      name: 'Nome',
      email: 'Email',
      phone: 'Telefono',
      age: 'Età',
      gender: 'Genere',
      newsUpdates: 'Aggiornamenti',
      subscribed: 'Iscritto',
      notSubscribed: 'Non iscritto',
      emergencyContact: 'Contatto di emergenza',
      foodAllergies: 'Allergie alimentari',
      medicalNotes: 'Note mediche / fisiche',
      loginEmail: 'Email di accesso',
      loginEmailNote: 'La tua email di accesso viene già usata automaticamente per le registrazioni.',
      editProfileTitle: 'Modifica profilo',
      editProfileDesc: 'Salva una volta i tuoi dati principali così le future registrazioni saranno più veloci e più semplici.',
      profilePhoto: 'Foto profilo',
      profilePhotoDesc: 'Aggiungi una foto per il tuo account oppure tieni l\'avatar generico.',
      choosePhoto: 'Scegli foto',
      useGenericAvatar: 'Usa avatar generico',
      photoNote: 'PNG, JPG, JPEG, WEBP, HEIC, HEIF o AVIF fino a 5 MB.',
      noNewFile: 'Nessun nuovo file selezionato.',
      usingGenericAvatar: 'Stai usando l\'avatar generico.',
      selectedFile: 'Selezionato: {name}',
      selectedFileNoPreview: 'Selezionato: {name} (anteprima non disponibile in questo browser)',
      fullName: 'Nome completo *',
      phoneNumber: 'Numero di telefono *',
      profileGender: 'Genere',
      profileAge: 'Età',
      emergencyName: 'Nome contatto di emergenza',
      emergencyPhone: 'Telefono contatto di emergenza',
      newsOptIn: 'Inviami novità, accesso anticipato ed eventi in arrivo.',
      foodAllergiesPlaceholder: 'Indica eventuali allergie oppure scrivi nessuna.',
      medicalPlaceholder: 'Qualsiasi informazione che vuoi precompilata per le future registrazioni.',
      saveProfile: 'Salva profilo',
      cancel: 'Annulla',
      accountTitle: 'Account',
      accountIntro: 'Crea il tuo account oppure accedi per registrarti agli eventi e completare il pagamento.',
      switchLogin: 'Accedi',
      switchSignup: 'Crea account',
      login: 'Accedi',
      createAccount: 'Crea account',
      helperGuest: 'Puoi visitare il sito senza account. Per registrarti a un evento e pagare serve invece un account.',
      password: 'Password *',
      confirmPassword: 'Conferma password *',
      confirmEmailHint: 'Dopo la registrazione puoi accedere subito con email e password.',
      optInNote: 'Facoltativo e sempre separato dal tuo login account.',
      loginErrorUnconfirmed: 'Questo account non è ancora attivo. Controlla le impostazioni di accesso oppure riprova tra poco.',
      loginSuccess: 'Ora sei connesso.',
      logoutSuccess: 'Ora hai effettuato il logout.',
      loginFailed: 'Accesso non riuscito.',
      signupPasswordMismatch: 'Inserisci la stessa password in entrambi i campi.',
      creatingAccount: 'Creazione account...',
      loggingIn: 'Accesso in corso...',
      accountCreatedAndLoggedIn: 'Account creato e accesso effettuato.',
      accountCreatedConfirm: 'Account creato. Ora puoi accedere con le tue credenziali.',
      accountCreatedFor: 'Il tuo account è stato creato per {email}. Ora puoi accedere con la stessa email e password.',
      accountCreationFailed: 'Creazione account non riuscita.',
      saveNamePhoneError: 'Salva almeno il tuo nome completo e il numero di telefono.',
      savingProfile: 'Salvataggio profilo...',
      profileSaved: 'Profilo salvato. Le future registrazioni saranno precompilate.',
      profileSaveFailed: 'Impossibile salvare il tuo profilo.',
      avatarNeedLogin: 'Devi essere connesso per caricare una foto profilo.',
      avatarFileTypeError: 'Scegli un\'immagine PNG, JPG, JPEG, WEBP, HEIC, HEIF o AVIF.',
      avatarFileSizeError: 'Scegli un\'immagine più piccola di 5 MB.',
      avatarPrepareError: 'L\'immagine selezionata non può essere preparata per il caricamento. Sceglila di nuovo.',
      avatarReadError: 'Non siamo riusciti a leggere quel file immagine. Prova con un\'altra immagine.'
    },
    booking: {
      signedInBanner: 'Connesso come {name}',
      signedInBannerDesc: 'Abbiamo precompilato qui sotto i dati salvati nel tuo account. Puoi comunque modificare tutto per questa registrazione.',
      guestBanner: 'Per registrarti a questo evento devi avere un account.',
      guestBannerCta: 'Accedi o crea account',
      guestBannerSuffix: ' per continuare.',
      registerFor: 'Registrati a {session}',
      fullName: 'Nome completo *',
      email: 'Email *',
      phone: 'Numero di telefono *',
      age: 'Età *',
      gender: 'Genere *',
      foodAllergies: 'Allergie alimentari',
      allergiesPlaceholder: 'Indica eventuali allergie oppure scrivi nessuna.',
      medical: 'Condizioni mediche / fisiche che dovremmo conoscere',
      medicalPlaceholder: 'Condividi qualsiasi informazione utile per allenarti in sicurezza.',
      emergencyName: 'Nome contatto di emergenza *',
      emergencyPhone: 'Telefono contatto di emergenza *',
      consent: 'Accetto che Fitness Truck possa conservare i miei dati per gestire la mia partecipazione in sicurezza.',
      waiver: 'Capisco che si tratta di un evento di attività fisica e partecipo sotto la mia responsabilità.',
      completeRegistration: 'Completa registrazione',
      continueToPayment: 'Continua al pagamento',
      redirectingToPayment: 'Reindirizzamento al pagamento...',
      cancel: 'Annulla',
      completeRequired: 'Compila tutti i campi obbligatori.',
      saving: 'Salvataggio...',
      savedEmailSent: 'Registrazione salvata ed email di conferma inviata.',
      savedEmailPending: 'Registrazione salvata. L\'email di conferma non è ancora stata inviata.',
      failed: 'Registrazione non riuscita.',
      loginRequired: 'Devi accedere o creare un account prima di registrarti.',
      loginRequiredCta: 'Accedi o crea account per registrarti',
      loginRequiredToast: 'Accedi al tuo account prima di registrarti a un evento.',
      register: 'Registrati',
      full: 'Completo',
      spotsLeft: 'posti disponibili'
    }
  },
  en: {
    meta: {
      title: 'Fitness Truck | The Gym That Moves',
      description: 'Premium outdoor fitness experiences in Ticino with professional coaching, included equipment, striking locations, and a motivating community.'
    },
    nav: {
      events: 'Events',
      experience: 'Experience',
      team: 'Team',
      contact: 'Contact',
      account: 'Account',
      myAccount: 'My Account',
      openAccount: 'Open account',
      openAccountFor: 'Open account for {name}',
      home: 'Home'
    },
    common: {
      selectOne: 'Select one',
      notSavedYet: 'Not saved yet',
      nothingSavedYet: 'Nothing saved yet',
      priceNotSet: 'Price not set yet',
      event: 'Event',
      session: 'Session',
      locationTbd: 'Location to be confirmed',
      timeTbd: 'Time to be confirmed',
      experience: 'Experience',
      save: 'Save',
      cancel: 'Cancel',
      loading: 'Loading…',
      retry: 'Try again'
    },
    gender: {
      male: 'Male',
      female: 'Female',
      other: 'Other',
      prefer_not_to_say: 'Prefer not to say',
      chooseLater: 'Prefer to choose later',
      notSavedYet: 'Gender not saved yet'
    },
    hero: {
      badge: 'Outdoor fitness experiences in Ticino',
      subtitle: 'Premium outdoor fitness experiences in striking Ticino locations. Professional coaching, top equipment, and an atmosphere that breaks routine in the best way.',
      statValue1: 'Mixed',
      statStops: 'Levels welcome',
      statValue2: 'Gear',
      statSpots: 'Equipment included',
      statValue3: 'Ticino',
      statEvents: 'Starting point',
      viewUpcoming: 'View events',
      createAccount: 'Create account',
      lugano: 'Lugano',
      monteBar: 'Monte Bar',
      lakeSessions: 'Lake sessions',
      ticinoEnergy: 'Ticino energy',
      scroll: 'Scroll to explore',
      signedIn: 'Signed in',
      welcomeBack: 'Welcome back, {name}',
      accountActive: 'Your account is active. Browse the schedule or open your account details anytime.',
      viewSchedule: 'View schedule',
      nextEvent: 'Next event',
      nextEventDesc: 'You are signed in. Here is the next event you can book right away.',
      sessions: 'Sessions',
      availableSessions: '{count} available sessions',
      availableSession: '{count} available session',
      availability: 'Availability',
      availabilityText: '{remaining} of {total} spots still open',
      viewNextEvent: 'Open event',
      myAccount: 'My account',
      accountCardLabel: 'Account',
      accountCardTitle: 'Create your account',
      accountCardDesc: 'Create your account to register and pay for events. Your details stay saved for future bookings.',
      fasterBookings: 'Faster future bookings',
      newsOptIn: 'Optional event news opt-in',
      guestBooking: 'Account required to register and pay'
    },
    events: {
      sectionEyebrow: 'Upcoming events',
      sectionTitleHtml: 'Find your next <span class="text-accent">event</span>',
      sectionDesc: 'Premium outdoor events in Ticino with limited spots, expert coaching, and locations worth the trip. Closed events stay visible, but registration only opens once they are confirmed.',
      emptyTitle: 'No upcoming events',
      emptyDesc: 'The next experience is taking shape now. Create your account so you are ready when new dates and registrations open.',
      emptyCta: 'Create account',
      calendarTitle: 'Upcoming calendar',
      soldOut: 'Sold out',
      almostFull: 'Almost full',
      open: 'Open',
      limited: 'Limited',
      closed: 'Closed',
      joining_one: '{count} participant',
      joining_other: '{count} participants',
      sessionsLabel_one: '{count} session',
      sessionsLabel_other: '{count} sessions',
      equipmentIncluded: 'Equipment included',
      defaultSummary: 'Professional coaching, premium equipment, and a community that moves.',
      openCardDesc: 'Registration is open now',
      soldOutCardDesc: 'Visible now, but fully booked',
      closedCardDesc: 'Visible now, but not bookable yet',
      viewDetails: 'View details',
      modalLogisticsTitle: 'Before you come',
      modalLogisticsDesc: 'Bring suitable training clothes and warm layers if needed. We bring the equipment and keep you updated if weather or logistics require changes.',
      modalMixedLevels: 'Mixed levels',
      modalWeather: 'Weather updates included',
      modalAccountRequired: 'Account required to book'
    },
    experience: {
      eyebrow: 'How to join',
      titleHtml: 'Simple, clear, <span class="text-accent">premium</span>',
      desc: 'From the first click to arrival on site, everything should feel straightforward and easy to understand.',
      step1Title: 'Choose the right event',
      step1Desc: 'Review the date, location, status, and availability. Each event is designed as an experience, not just another class.',
      step2Title: 'Create your account and book',
      step2Desc: 'An account keeps registration and payment organised. Your saved details make future bookings faster.',
      step3Title: 'Show up ready',
      step3Desc: 'Arrive in suitable clothing, and we bring the truck, the equipment, the coaching, and the group energy. If weather requires changes, we update you in advance.'
    },
    expect: {
      eyebrow: 'What to expect',
      titleHtml: 'More than a <span class="text-accent">workout</span>',
      desc: 'Each experience blends training quality, atmosphere, nature, and fresh motivation.',
      feature1: 'Functional strength',
      feature2: 'Mobility & recovery',
      feature3: 'Motivating community',
      feature4: 'Outdoor experience',
      feature5: 'Expert coaching',
      feature6: 'Premium equipment',
      photo1: 'Real energy',
      photo2: 'Precise coaching',
      photo3: 'Memorable locations',
      card1Title: 'Training that resets you',
      card1Desc: 'Sessions intense enough to challenge you, yet designed to stay accessible for mixed levels and make you want to come back.',
      card2Title: 'Quality you can feel',
      card2Desc: 'You are not stepping into something improvised. You are stepping into a curated experience shaped by place, people, and how it makes you feel.'
    },
    concept: {
      eyebrow: 'Why Fitness Truck',
      titleHtml: 'Train well, <span class="text-accent">outside the usual</span>',
      desc: 'Fitness Truck brings high-quality training energy into places that change your perspective. It is not here to replace the gym. It gives you a new reason to move.',
      card1Title: 'Premium setup',
      card1Desc: 'Professional coaching, top equipment, and sessions designed with care. The experience should feel serious, clean, and well organised.',
      card2Title: 'Changing locations',
      card2Desc: 'Mountains, lakes, nature, and special settings. Every event is built to pull you out of monotony and make training feel fresh again.',
      card3Title: 'A moving community',
      card3Desc: 'Small groups, motivated people, positive atmosphere. Come for the training, stay for the shared energy.'
    },
    team: {
      eyebrow: 'The team',
      titleHtml: 'Coaching with <span class="text-accent">vision</span>',
      desc: 'Fitness Truck is built to combine coaching quality, wellbeing, and experience design in a format that feels credible and carefully made.',
      nicolasBio: 'Shapes the Fitness Truck concept and experience, turning training into something people carry with them after the session ends.',
      nazarenoBio: 'Brings structure, intensity, and coaching depth to every activation, helping people move better and train with purpose.',
      lorenzoBio: 'Supports recovery, resilience, and long-term physical wellbeing, adding an even deeper level of care to the experience.'
    },
    teaser: {
      eyebrow: 'On request',
      titleHtml: 'Also for <span class="text-accent">teams and private groups</span>',
      desc: 'We are also opening the door to corporate wellness, team-building, hotel partners, and private groups. For now, we handle it on request with thoughtful formats and locations that make a difference.',
      primaryCta: 'Contact us',
      secondaryCta: 'Read the FAQ'
    },
    faq: {
      eyebrow: 'FAQ',
      titleHtml: 'The most important <span class="text-accent">questions</span>',
      desc: 'The basics you should know before booking your place with Fitness Truck.',
      q1: 'Do I need an account to book?',
      a1: 'Yes. You can explore the site freely, but to register for an event and pay, a Fitness Truck account is required.',
      q2: 'Is equipment included?',
      a2: 'Yes. We bring the equipment. You only need to arrive with suitable training clothes and warm layers when temperatures require it.',
      q3: 'What happens if the weather gets worse?',
      a3: 'Events normally go ahead in manageable outdoor conditions. If the weather becomes unsafe, we may postpone, relocate, or cancel the event and notify you in advance.',
      q4: 'Can I cancel my participation?',
      a4: 'Yes. Cancellation is free up to 48 hours before the event. After that, no refund is provided unless Fitness Truck cancels the event.',
      fullCta: 'Open full FAQ',
      policyCta: 'Read terms and policies'
    },
    contact: {
      eyebrow: 'Contact',
      titleHtml: 'Let\'s stay in <span class="text-accent">touch</span>',
      desc: 'Questions, future collaborations, or requests for private groups? We would love to hear from you.',
      email: 'Email',
      phone: 'Phone',
      instagram: 'Instagram',
      locations: 'Locations',
      locationsValue: 'Starting from Ticino · Swiss-wide vision',
      formName: 'Your name',
      formEmail: 'Your email',
      formMessage: 'Your message',
      formNamePlaceholder: 'Jane Smith',
      formEmailPlaceholder: 'jane@example.com',
      formMessagePlaceholder: 'Tell us what you are looking for and we will get back to you.',
      send: 'Send message',
      sending: 'Sending...'
    },
    footer: {
      tagline: 'Premium outdoor experiences, born in Ticino.',
      faq: 'FAQ',
      privacy: 'Privacy',
      terms: 'Terms',
      admin: 'Admin',
      rights: '© 2026 Fitness Truck. All rights reserved.',
      backToTop: 'Back to top'
    },
    account: {
      registrationsTitle: 'My registrations',
      registrationsLoading: 'We are loading your booked sessions now.',
      registrationsLoadingEmpty: 'Loading your registrations…',
      registrationsErrorDesc: 'Your booked sessions appear here once we can read them.',
      registrationsErrorEmpty: 'We could not load your registrations yet.',
      linkedBookingsToast_one: '{count} earlier booking linked to your account.',
      linkedBookingsToast_other: '{count} earlier bookings linked to your account.',
      linkedBookingsHeader_one: 'Linked {count} earlier booking from your guest email.',
      linkedBookingsHeader_other: 'Linked {count} earlier bookings from your guest email.',
      registrationsHeaderDefault: 'See the events you already booked with this email address. Older guest bookings with the same email are linked automatically.',
      paymentPendingRefresh: 'Payment received. We are updating your registrations…',
      paymentSynced: 'Registration confirmed. Your spot has been updated.',
      paymentFailed: 'Payment failed. Please try again whenever you are ready.',
      paymentCancelled: 'Payment cancelled. No spot was reserved.',
      total: '{count} total',
      upcoming: 'Upcoming',
      past: 'Past',
      recentHistoryOnly: 'Recent history only. We keep your full participation log in admin.',
      noUpcomingYet: 'No upcoming events yet.',
      noPastYet: 'Your recent past events will appear here once you have trained with us.',
      upcomingEventKicker: 'Upcoming event',
      upcomingStatus: 'Upcoming',
      labelSession: 'Session',
      labelTime: 'Time',
      labelType: 'Type',
      labelPrice: 'Price',
      booked: 'Booked {value}',
      openEvent: 'Open event',
      loadMorePast: 'Load {count} more past events',
      signedIn: 'Signed in',
      yourAccount: 'Your account',
      summaryDesc: 'These saved details are reused automatically when you register for the next event.',
      editProfile: 'Edit profile',
      continueBooking: 'Continue booking',
      logOut: 'Log out',
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      age: 'Age',
      gender: 'Gender',
      newsUpdates: 'News updates',
      subscribed: 'Subscribed',
      notSubscribed: 'Not subscribed',
      emergencyContact: 'Emergency contact',
      foodAllergies: 'Food allergies',
      medicalNotes: 'Medical / physical notes',
      loginEmail: 'Login email',
      loginEmailNote: 'Your login email is already used automatically for registrations.',
      editProfileTitle: 'Edit profile',
      editProfileDesc: 'Save your default details once so future registrations feel faster and easier.',
      profilePhoto: 'Profile photo',
      profilePhotoDesc: 'Add a photo for your account, or keep the generic avatar.',
      choosePhoto: 'Choose photo',
      useGenericAvatar: 'Use generic avatar',
      photoNote: 'PNG, JPG, JPEG, WEBP, HEIC, HEIF, or AVIF up to 5 MB.',
      noNewFile: 'No new file selected.',
      usingGenericAvatar: 'Using the generic avatar.',
      selectedFile: 'Selected: {name}',
      selectedFileNoPreview: 'Selected: {name} (preview not available in this browser)',
      fullName: 'Full name *',
      phoneNumber: 'Phone number *',
      profileGender: 'Gender',
      profileAge: 'Age',
      emergencyName: 'Emergency contact name',
      emergencyPhone: 'Emergency contact phone',
      newsOptIn: 'Email me news, early access, and event updates.',
      foodAllergiesPlaceholder: 'List any allergies or write none.',
      medicalPlaceholder: 'Anything you want prefilled for future registrations.',
      saveProfile: 'Save profile',
      cancel: 'Cancel',
      accountTitle: 'Account',
      accountIntro: 'Create your account or sign in to register for events and complete payment.',
      switchLogin: 'Log in',
      switchSignup: 'Create account',
      login: 'Log in',
      createAccount: 'Create account',
      helperGuest: 'You can browse the site without an account. To register for an event and pay, an account is required.',
      password: 'Password *',
      confirmPassword: 'Confirm password *',
      confirmEmailHint: 'After signup, you can log in right away with your email and password.',
      optInNote: 'Optional and always separate from your account login.',
      loginErrorUnconfirmed: 'This account is not active yet. Please review the access settings or try again shortly.',
      loginSuccess: 'You are now logged in.',
      logoutSuccess: 'You are now logged out.',
      loginFailed: 'Login failed.',
      signupPasswordMismatch: 'Please re-enter the same password in both fields.',
      creatingAccount: 'Creating account...',
      loggingIn: 'Logging in...',
      accountCreatedAndLoggedIn: 'Account created and you are now logged in.',
      accountCreatedConfirm: 'Account created. You can now log in with your credentials.',
      accountCreatedFor: 'Your account was created for {email}. You can now log in with the same email and password.',
      accountCreationFailed: 'Account creation failed.',
      saveNamePhoneError: 'Please save at least your full name and phone number.',
      savingProfile: 'Saving profile...',
      profileSaved: 'Profile saved. Future registrations will be prefilled.',
      profileSaveFailed: 'Could not save your profile.',
      avatarNeedLogin: 'You need to be logged in to upload a profile photo.',
      avatarFileTypeError: 'Please choose a PNG, JPG, JPEG, WEBP, HEIC, HEIF, or AVIF image.',
      avatarFileSizeError: 'Please choose an image smaller than 5 MB.',
      avatarPrepareError: 'The selected image could not be prepared for upload. Please choose it again.',
      avatarReadError: 'We could not read that image file. Please try a different image.'
    },
    booking: {
      signedInBanner: 'Signed in as {name}',
      signedInBannerDesc: 'We prefilled your saved account details below. You can still adjust anything for this registration.',
      guestBanner: 'You need an account to register for this event.',
      guestBannerCta: 'Log in or create account',
      guestBannerSuffix: ' to continue.',
      registerFor: 'Register for {session}',
      fullName: 'Full name *',
      email: 'Email *',
      phone: 'Phone number *',
      age: 'Age *',
      gender: 'Gender *',
      foodAllergies: 'Food allergies',
      allergiesPlaceholder: 'List any allergies or write none.',
      medical: 'Medical / physical conditions we should know about',
      medicalPlaceholder: 'Share anything relevant for training safety.',
      emergencyName: 'Emergency contact name *',
      emergencyPhone: 'Emergency contact phone *',
      consent: 'I agree that Fitness Truck may store my information to manage my participation safely.',
      waiver: 'I understand this is a physical activity event and I participate at my own responsibility.',
      completeRegistration: 'Complete registration',
      continueToPayment: 'Continue to payment',
      redirectingToPayment: 'Redirecting to payment...',
      cancel: 'Cancel',
      completeRequired: 'Please complete all required fields.',
      saving: 'Saving...',
      savedEmailSent: 'Registration saved and confirmation email sent.',
      savedEmailPending: 'Registration saved. Confirmation email could not be sent yet.',
      failed: 'Registration failed.',
      loginRequired: 'You need to sign in or create an account before you can register.',
      loginRequiredCta: 'Log in or create account to register',
      loginRequiredToast: 'Please sign in to your account before registering for an event.',
      register: 'Register',
      full: 'Full',
      spotsLeft: 'spots left'
    }
  }
};

function getLocale() {
  return state.language === 'en' ? 'en-CH' : 'it-CH';
}

function getTranslationValue(key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), TRANSLATIONS[state.language] || TRANSLATIONS.it);
}

function t(key, vars = {}) {
  const fallback = key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), TRANSLATIONS.en) || key;
  const value = getTranslationValue(key);
  const template = typeof value === 'string' ? value : fallback;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function getPluralKey(baseKey, count) {
  return `${baseKey}_${count === 1 ? 'one' : 'other'}`;
}

function getCountLabel(baseKey, count) {
  return t(getPluralKey(baseKey, count), { count });
}

function getEventSummaryCopy(event) {
  const summary = String(event?.heroPhrase || event?.description || '').trim();
  return summary || t('events.defaultSummary');
}

function applyStaticTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  root.querySelectorAll('[data-i18n-title-attr]').forEach((el) => {
    el.setAttribute('title', t(el.dataset.i18nTitleAttr));
  });

  document.documentElement.lang = state.language;
  document.title = t('meta.title');
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.setAttribute('content', t('meta.description'));

  document.querySelectorAll('[data-lang-choice]').forEach((button) => {
    const active = button.dataset.langChoice === state.language;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function rerenderLanguageUI() {
  applyStaticTranslations();
  updateAccountButton();
  scheduleHeroSideCardRender();
  renderEvents();
  renderCalendar();
  updateEmptyState();
  if (!isAccountPage()) observeAnimatable();
  if (isAuthModalOpen() || isAccountPage()) renderAuthModal();
  if (state.currentEvent) {
    const content = document.getElementById('modalContent');
    if (content) {
      content.innerHTML = renderEventModal(state.currentEvent);
      bindModalActions();
      if (state.selectedSessionId) renderRegistrationForm();
    }
  }
  initForms();
}

function setLanguage(language) {
  const nextLanguage = language === 'en' ? 'en' : 'it';
  if (state.language === nextLanguage) return;
  state.language = nextLanguage;
  try { localStorage.setItem('ft_lang', nextLanguage); } catch (error) { /* noop */ }

  if (isAccountPage()) {
    applyStaticTranslations();
    renderAccountPageStaticAuth();
    renderAuthModal();
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setTimeout(() => window.location.replace(currentUrl), 10);
    return;
  }

  rerenderLanguageUI();
}

function initLanguage() {
  applyStaticTranslations();
  document.querySelectorAll('[data-lang-choice]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.langChoice));
  });
}

function getUserMetadata(user = state.user) {
  return user?.user_metadata || {};
}

function getUserDisplayName(user = state.user) {
  const metadata = getUserMetadata(user);
  const fullName = String(metadata.full_name || '').trim();
  if (fullName) return fullName;
  const email = String(user?.email || '').trim();
  return email ? email.split('@')[0] : t('nav.account');
}

function getUserPhone(user = state.user) {
  return String(getUserMetadata(user).phone || '').trim();
}

function normalizeGenderValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['male', 'female', 'other', 'prefer_not_to_say'].includes(normalized) ? normalized : '';
}

function getGenderLabel(value, fallback = t('common.notSavedYet')) {
  const labels = {
    male: t('gender.male'),
    female: t('gender.female'),
    other: t('gender.other'),
    prefer_not_to_say: t('gender.prefer_not_to_say')
  };
  return labels[normalizeGenderValue(value)] || fallback;
}

function buildGenderOptionsHtml(selected = '', includePlaceholder = false) {
  const normalized = normalizeGenderValue(selected);
  const options = [
    ['male', t('gender.male')],
    ['female', t('gender.female')],
    ['other', t('gender.other')],
    ['prefer_not_to_say', t('gender.prefer_not_to_say')]
  ];

  const placeholder = includePlaceholder
    ? `<option value="" ${normalized ? '' : 'selected'} disabled>${escapeHtml(t('common.selectOne'))}</option>`
    : '';

  return `${placeholder}${options.map(([value, label]) => `<option value="${value}" ${normalized === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}`;
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

function getEventPhotoUrl(event) {
  return String(event?.photoUrl || event?.photo_url || '').trim();
}

function getEventPhotoStyle(event) {
  const photoUrl = getEventPhotoUrl(event);
  if (!photoUrl) return '';
  return `style="background-image:linear-gradient(180deg, rgba(8,8,8,0.08) 0%, rgba(8,8,8,0.58) 100%), url('${escapeAttr(photoUrl)}');"`;
}

function getEventLocationMarker(event) {
  return String(event?.location || '').split(/[,·-]/)[0].trim() || 'Ticino';
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
  state.visiblePastRegistrations = 5;
}

function resetClaimRegistrationsState() {
  state.claimRegistrationsStatus = 'idle';
  state.claimRegistrationsForEmail = '';
  state.claimRegistrationsCount = 0;
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
  return price > 0 ? `CHF ${price.toFixed(2)}` : t('common.priceNotSet');
}

function renderUpcomingRegistrationCards(items = [], emptyMessage = t('account.noUpcomingYet')) {
  if (!items.length) {
    return `<div class="auth-registrations-empty">${escapeHtml(emptyMessage)}</div>`;
  }

  return items.map((item) => `
    <article class="auth-registration-card">
      <div class="auth-registration-card-top">
        <div>
          <div class="auth-registration-kicker">${escapeHtml(t('account.upcomingEventKicker'))}</div>
          <h4>${escapeHtml(item.event_title || t('common.event'))}</h4>
        </div>
        <span class="auth-registration-status upcoming">${escapeHtml(t('account.upcomingStatus'))}</span>
      </div>
      <div class="auth-registration-meta">
        <span>${escapeHtml(formatDate(item.event_date))}</span>
        <span>${escapeHtml(item.event_location || t('common.locationTbd'))}</span>
      </div>
      <div class="auth-registration-details">
        <div class="auth-registration-detail">
          <strong>${escapeHtml(t('account.labelSession'))}</strong>
          <span>${escapeHtml(item.session_title || t('common.session'))}</span>
        </div>
        <div class="auth-registration-detail">
          <strong>${escapeHtml(t('account.labelTime'))}</strong>
          <span>${escapeHtml(item.session_start_time && item.session_end_time ? `${item.session_start_time} - ${item.session_end_time}` : t('common.timeTbd'))}</span>
        </div>
        <div class="auth-registration-detail">
          <strong>${escapeHtml(t('account.labelType'))}</strong>
          <span>${escapeHtml(item.session_exercise_type || t('common.experience'))}</span>
        </div>
        <div class="auth-registration-detail">
          <strong>${escapeHtml(t('account.labelPrice'))}</strong>
          <span>${escapeHtml(getRegistrationPriceLabel(item))}</span>
        </div>
      </div>
      <div class="auth-registration-footer">
        <span>${escapeHtml(t('account.booked', { value: item.created_at_label || '' }))}</span>
        ${item.event_id ? (isAccountPage()
          ? `<a href="${escapeAttr(buildEventOpenUrl(item.event_id))}" class="btn btn-secondary btn-inline" data-account-open-event-id="${escapeAttr(item.event_id)}">${escapeHtml(t('account.openEvent'))}</a>`
          : `<button type="button" class="btn btn-secondary btn-inline" data-open-booking-event-id="${escapeAttr(item.event_id)}">${escapeHtml(t('account.openEvent'))}</button>`) : ''}
      </div>
    </article>
  `).join('');
}

function renderPastRegistrationCards(items = [], emptyMessage = t('account.noPastYet')) {
  if (!items.length) {
    return `<div class="auth-registrations-empty">${escapeHtml(emptyMessage)}</div>`;
  }

  const visibleCount = Math.max(5, Number(state.visiblePastRegistrations || 5));
  const visibleItems = items.slice(0, visibleCount);
  const remainingCount = Math.max(0, items.length - visibleItems.length);

  return `
    <div class="auth-past-history-list">
      ${visibleItems.map((item) => `
        <article class="auth-past-history-item">
          <div class="auth-past-history-main">
            <h4>${escapeHtml(item.event_title || t('common.event'))}</h4>
            <p>${escapeHtml(item.event_location || t('common.locationTbd'))}</p>
          </div>
          <time datetime="${escapeAttr(item.event_date || '')}">${escapeHtml(formatDate(item.event_date))}</time>
        </article>
      `).join('')}
    </div>
    ${remainingCount > 0 ? `<button type="button" class="btn btn-secondary btn-inline auth-load-more-history-btn" id="loadMorePastRegistrationsBtn">${escapeHtml(t('account.loadMorePast', { count: Math.min(5, remainingCount) }))}</button>` : ''}
  `;
}

async function claimGuestRegistrationsByEmail(options = {}) {
  const { force = false, quiet = false } = options;
  const userEmail = String(state.user?.email || '').trim().toLowerCase();

  if (!state.user || !userEmail) {
    resetClaimRegistrationsState();
    return 0;
  }

  if (!force && state.claimRegistrationsStatus === 'loading') return state.claimRegistrationsCount;
  if (!force && state.claimRegistrationsStatus === 'success' && state.claimRegistrationsForEmail === userEmail) {
    return state.claimRegistrationsCount;
  }

  state.claimRegistrationsStatus = 'loading';
  state.claimRegistrationsForEmail = userEmail;

  try {
    const { data, error } = await supabaseClient.rpc('claim_my_registrations_by_email');
    if (error) throw error;

    const claimedCount = Number(data?.claimed_count || data?.claimedCount || 0);
    state.claimRegistrationsStatus = 'success';
    state.claimRegistrationsForEmail = userEmail;
    state.claimRegistrationsCount = Number.isFinite(claimedCount) ? claimedCount : 0;

    if (!quiet && state.claimRegistrationsCount > 0) {
      showToast(t(getPluralKey('account.linkedBookingsToast', state.claimRegistrationsCount), { count: state.claimRegistrationsCount }), 'success');
    }

    return state.claimRegistrationsCount;
  } catch (error) {
    console.error('Claim registrations error:', error);
    state.claimRegistrationsStatus = 'error';
    state.claimRegistrationsForEmail = userEmail;
    state.claimRegistrationsCount = 0;
    return 0;
  }
}

function getMyRegistrationsMarkup() {
  if (!state.user) return '';

  if (state.myRegistrationsStatus === 'loading') {
    return `
      <section class="auth-registrations-panel">
        <div class="auth-registrations-header">
          <div>
            <h3>${escapeHtml(t('account.registrationsTitle'))}</h3>
            <p>${escapeHtml(t('account.registrationsLoading'))}</p>
          </div>
        </div>
        <div class="auth-registrations-empty">${escapeHtml(t('account.registrationsLoadingEmpty'))}</div>
      </section>`;
  }

  if (state.myRegistrationsStatus === 'error') {
    return `
      <section class="auth-registrations-panel">
        <div class="auth-registrations-header">
          <div>
            <h3>${escapeHtml(t('account.registrationsTitle'))}</h3>
            <p>${escapeHtml(t('account.registrationsErrorDesc'))}</p>
          </div>
          <button type="button" class="btn btn-secondary btn-inline" id="retryMyRegistrationsBtn">${escapeHtml(t('common.retry'))}</button>
        </div>
        <div class="auth-registrations-empty">${escapeHtml(state.myRegistrationsError || t('account.registrationsErrorEmpty'))}</div>
      </section>`;
  }

  const upcoming = state.myRegistrations.filter((item) => item.is_upcoming);
  const past = state.myRegistrations.filter((item) => !item.is_upcoming);
  const linkedCopy = state.claimRegistrationsCount > 0
    ? t(getPluralKey('account.linkedBookingsHeader', state.claimRegistrationsCount), { count: state.claimRegistrationsCount })
    : t('account.registrationsHeaderDefault');

  return `
    <section class="auth-registrations-panel">
      <div class="auth-registrations-header">
        <div>
          <h3>${escapeHtml(t('account.registrationsTitle'))}</h3>
          <p>${escapeHtml(linkedCopy)}</p>
        </div>
        <span class="auth-registrations-count">${escapeHtml(t('account.total', { count: state.myRegistrations.length }))}</span>
      </div>
      <div class="auth-registrations-group">
        <div class="auth-registrations-group-header">
          <strong>${escapeHtml(t('account.upcoming'))}</strong>
          <span>${upcoming.length}</span>
        </div>
        ${renderUpcomingRegistrationCards(upcoming, t('account.noUpcomingYet'))}
      </div>
      <div class="auth-registrations-group">
        <div class="auth-registrations-group-header">
          <strong>${escapeHtml(t('account.past'))}</strong>
          <span>${past.length}</span>
        </div>
        <div class="auth-group-note">${escapeHtml(t('account.recentHistoryOnly'))}</div>
        ${renderPastRegistrationCards(past, t('account.noPastYet'))}
      </div>
    </section>`;
}

async function loadMyRegistrations(options = {}) {
  const { force = false } = options;
  const userEmail = String(state.user?.email || '').trim().toLowerCase();
  if (!userEmail) {
    resetMyRegistrationsState();
    resetClaimRegistrationsState();
    return [];
  }

  const alreadyClaimedForEmail = state.claimRegistrationsStatus === 'success' && state.claimRegistrationsForEmail === userEmail;
  if (!alreadyClaimedForEmail || force) {
    await claimGuestRegistrationsByEmail({ force, quiet: false });
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
    state.visiblePastRegistrations = 5;
    state.myRegistrationsStatus = 'success';
    state.myRegistrationsForEmail = userEmail;
    state.myRegistrationsError = '';
  } catch (error) {
    console.error('My registrations load error:', error);
    state.myRegistrations = [];
    state.myRegistrationsStatus = 'error';
    state.myRegistrationsForEmail = userEmail;
    state.myRegistrationsError = error.message || t('account.registrationsErrorEmpty');
  }

  if (isAuthModalOpen() && state.user && state.accountMode === 'summary') renderAuthModal();
  return state.myRegistrations;
}

function updateAccountButton() {
  const button = document.getElementById('accountBtn');
  if (!button) return;
  if (state.user) {
    button.textContent = t('nav.myAccount');
    button.classList.add('account-pill');
    button.setAttribute('aria-label', t('nav.openAccountFor', { name: getUserDisplayName() }));
    button.setAttribute('title', getUserDisplayName());
  } else {
    button.textContent = t('nav.account');
    button.classList.remove('account-pill');
    button.setAttribute('aria-label', t('nav.openAccount'));
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
      <span class="next-event-kicker">${escapeHtml(t('hero.signedIn'))}</span>
      <h3>${escapeHtml(t('hero.welcomeBack', { name: getUserDisplayName() }))}</h3>
      <p>${escapeHtml(t('hero.accountActive'))}</p>
      <div class="account-card-actions">
        <button type="button" class="btn btn-primary" id="heroBrowseEventsBtn">${escapeHtml(t('hero.viewSchedule'))}</button>
        <button type="button" class="btn btn-secondary" id="heroFallbackAccountBtn">${escapeHtml(t('hero.myAccount'))}</button>
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
    resetClaimRegistrationsState();
  } else if (state.myRegistrationsForEmail && state.myRegistrationsForEmail !== String(state.user.email || '').trim().toLowerCase()) {
    resetMyRegistrationsState();
    resetClaimRegistrationsState();
  }
  updateAccountButton();
  scheduleHeroSideCardRender();
  if (isAccountPage() || isAuthModalOpen()) {
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
      if (!isAccountPage()) {
        event.preventDefault();
        goToAccountPage(view);
        return;
      }
      openAuthModal(view, event.currentTarget);
    });
  });
}

function renderHeroSideCard() {
  const mount = document.getElementById('heroSideCard');
  if (!mount) return;

  mount.dataset.authState = state.user ? 'logged-in' : 'logged-out';

  if (state.user && !state.eventsLoaded) {
    mount.hidden = false;
    mount.innerHTML = `
      <div class="floating-card next-event-hero-card hero-card-placeholder" aria-hidden="true">
        <div class="hero-skeleton hero-skeleton-media"></div>
        <div class="hero-skeleton hero-skeleton-kicker"></div>
        <div class="hero-skeleton hero-skeleton-title"></div>
        <div class="hero-skeleton hero-skeleton-copy"></div>
        <div class="hero-skeleton hero-skeleton-copy short"></div>
        <div class="hero-skeleton hero-skeleton-meta"></div>
        <div class="hero-skeleton hero-skeleton-summary"></div>
        <div class="hero-skeleton hero-skeleton-actions"></div>
      </div>`;
    return;
  }

  if (!state.user) {
    mount.hidden = false;
    mount.innerHTML = `
      <div class="floating-card account-hero-card">
        <div class="card-glow"></div>
        <span class="account-hero-label">${escapeHtml(t('hero.accountCardLabel'))}</span>
        <h3>${escapeHtml(t('hero.accountCardTitle'))}</h3>
        <p>${escapeHtml(t('hero.accountCardDesc'))}</p>
        <div class="account-card-actions">
          <button type="button" class="btn btn-primary" data-open-auth="signup">${escapeHtml(t('account.createAccount'))}</button>
          <button type="button" class="btn btn-secondary" data-open-auth="login">${escapeHtml(t('account.login'))}</button>
        </div>
        <div class="account-benefits" aria-label="Account benefits">
          <div class="account-benefit">✓ ${escapeHtml(t('hero.fasterBookings'))}</div>
          <div class="account-benefit">✓ ${escapeHtml(t('hero.newsOptIn'))}</div>
          <div class="account-benefit">✓ ${escapeHtml(t('hero.guestBooking'))}</div>
        </div>
      </div>`;
    bindAuthLaunchers(mount);
    return;
  }

  const nextEvent = getUpcomingBookableEvents()[0] || null;
  const nextEventSessions = getPublicSessions(nextEvent);
  if (!nextEvent || !nextEventSessions.length) {
    renderSignedInHeroFallback(mount);
    return;
  }

  const totalSpots = nextEventSessions.reduce((sum, session) => sum + Number(session.maxParticipants || 0), 0);
  const totalRegistered = nextEventSessions.reduce((sum, session) => sum + Number(session.registered || 0), 0);
  const remainingSpots = Math.max(totalSpots - totalRegistered, 0);
  const nextEventPhotoUrl = getEventPhotoUrl(nextEvent);
  const sessionsCopy = nextEventSessions.length === 1
    ? t('hero.availableSession', { count: nextEventSessions.length })
    : t('hero.availableSessions', { count: nextEventSessions.length });

  mount.hidden = false;
  mount.innerHTML = `
    <div class="floating-card next-event-hero-card">
      <div class="card-glow"></div>
      ${nextEventPhotoUrl ? `<div class="next-event-hero-media"><img src="${escapeAttr(nextEventPhotoUrl)}" alt="${escapeAttr(nextEvent.title)}"></div>` : ''}
      <span class="next-event-kicker">${escapeHtml(t('hero.nextEvent'))}</span>
      <h3>${escapeHtml(nextEvent.title)}</h3>
      <p>${escapeHtml(t('hero.nextEventDesc'))}</p>
      <div class="next-event-meta">
        <span>${escapeHtml(formatDate(nextEvent.date))}</span>
        <span>${escapeHtml(nextEvent.location)}</span>
      </div>
      <div class="next-event-summary">
        <div class="next-event-summary-item">
          <strong>${escapeHtml(t('hero.sessions'))}</strong>
          ${escapeHtml(sessionsCopy)}
        </div>
        <div class="next-event-summary-item">
          <strong>${escapeHtml(t('hero.availability'))}</strong>
          ${escapeHtml(t('hero.availabilityText', { remaining: remainingSpots, total: totalSpots }))}
        </div>
      </div>
      <div class="account-card-actions">
        <button type="button" class="btn btn-primary" id="heroNextEventBtn">${escapeHtml(t('hero.viewNextEvent'))}</button>
        <button type="button" class="btn btn-secondary" id="heroMyAccountBtn">${escapeHtml(t('hero.myAccount'))}</button>
      </div>
    </div>`;

  document.getElementById('heroNextEventBtn')?.addEventListener('click', () => openEventModal(nextEvent.id));
  document.getElementById('heroMyAccountBtn')?.addEventListener('click', (event) => openAuthModal('login', event.currentTarget));
}

function openAuthModal(view = 'login', triggerEl = document.activeElement) {
  state.authView = view === 'signup' ? 'signup' : 'login';
  if (state.user) state.accountMode = 'summary';
  state.lastAuthTriggerEl = triggerEl || null;

  const launchedFromEventFlow = !!(triggerEl && typeof triggerEl.closest === 'function' && triggerEl.closest('#modalOverlay'));

  if (!isAccountPage() && !launchedFromEventFlow) {
    goToAccountPage(state.user ? 'login' : state.authView);
    return;
  }

  renderAuthModal();
  const overlay = document.getElementById('authOverlay');
  if (!overlay) {
    if (state.user && state.accountMode === 'summary') {
      loadMyRegistrations();
    }
    return;
  }
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
  if (isAccountPage()) {
    renderAuthModal();
    return;
  }
  const overlay = document.getElementById('authOverlay');
  if (!overlay) return;
  overlay.setAttribute('aria-hidden', 'true');
  const eventOverlay = document.getElementById('modalOverlay');
  const eventModalOpen = eventOverlay && eventOverlay.getAttribute('aria-hidden') === 'false';
  document.body.style.overflow = eventModalOpen ? 'hidden' : '';
  if (state.lastAuthTriggerEl) state.lastAuthTriggerEl.focus();
}

function getAccountAuthStaticElements() {
  return {
    shell: document.getElementById('accountAuthStatic'),
    mount: document.getElementById('authModalContent'),
    notice: document.getElementById('accountAuthNotice'),
    loginForm: document.getElementById('accountLoginForm'),
    signupForm: document.getElementById('accountSignupForm'),
    loginTab: document.getElementById('accountLoginTab'),
    signupTab: document.getElementById('accountSignupTab')
  };
}

function renderAccountPageStaticAuth() {
  if (!isAccountPage()) return;
  const { shell, mount, notice, loginForm, signupForm, loginTab, signupTab } = getAccountAuthStaticElements();
  if (!shell) return;

  const loggedOut = !state.user;
  shell.hidden = !loggedOut;
  if (mount) mount.hidden = loggedOut;

  if (!loggedOut) {
    if (notice) {
      notice.hidden = true;
      notice.textContent = '';
      notice.className = 'auth-notice info';
    }
    return;
  }

  const showSignup = state.authView === 'signup';
  if (loginForm) loginForm.hidden = showSignup;
  if (signupForm) signupForm.hidden = !showSignup;
  if (loginTab) loginTab.classList.toggle('active', !showSignup);
  if (signupTab) signupTab.classList.toggle('active', showSignup);
  if (loginTab) loginTab.setAttribute('aria-selected', String(!showSignup));
  if (signupTab) signupTab.setAttribute('aria-selected', String(showSignup));

  if (notice) {
    if (state.authNotice?.message) {
      notice.hidden = false;
      notice.textContent = state.authNotice.message;
      notice.className = `auth-notice ${state.authNotice.type || 'info'}`;
    } else {
      notice.hidden = true;
      notice.textContent = '';
      notice.className = 'auth-notice info';
    }
  }
}

function bindAccountPageStaticAuth() {
  if (!isAccountPage()) return;
  const { shell, loginForm, signupForm } = getAccountAuthStaticElements();
  if (!shell || shell.dataset.bound === '1') return;
  shell.dataset.bound = '1';

  shell.querySelectorAll('[data-account-view]').forEach((button) => {
    button.addEventListener('click', () => {
      state.authView = button.dataset.accountView === 'signup' ? 'signup' : 'login';
      if (state.authView === 'signup' && state.authNotice?.type === 'success') setAuthNotice();
      renderAccountPageStaticAuth();
      const target = state.authView === 'signup' ? document.getElementById('signupFullName') : document.getElementById('loginEmail');
      target?.focus();
    });
  });

  loginForm?.addEventListener('submit', handleLoginSubmit);
  signupForm?.addEventListener('submit', handleSignupSubmit);
}

function isAuthModalOpen() {
  const overlay = document.getElementById('authOverlay');
  return !!overlay && overlay.getAttribute('aria-hidden') === 'false';
}

function renderAuthModal() {
  const mount = document.getElementById('authModalContent');
  if (isAccountPage()) renderAccountPageStaticAuth();
  if (!mount) return;

  if (isAccountPage() && !state.user) {
    mount.innerHTML = '';
    mount.hidden = true;
    return;
  }

  if (state.user) {
    const profile = getUserProfileData();

    if (state.accountMode === 'edit') {
      mount.innerHTML = `
        <div class="auth-card">
          <span class="auth-status-pill">${escapeHtml(t('account.signedIn'))}</span>
          <div>
            <h2 class="auth-title" id="authModalTitle">${escapeHtml(t('account.editProfileTitle'))}</h2>
            <p class="auth-muted">${escapeHtml(t('account.editProfileDesc'))}</p>
          </div>
          <div class="auth-profile-layout">
            <div class="auth-avatar-panel">
              <img src="${escapeAttr(state.pendingProfileAvatarPreviewUrl || (state.pendingProfileRemoveAvatar ? buildAvatarPlaceholderDataUri(getUserDisplayName()) : profile.avatar_url))}" alt="${escapeAttr(`${getUserDisplayName()} profile photo`)}" class="auth-avatar-image auth-avatar-image-large" id="profileAvatarPreview" />
              <div class="auth-avatar-copy">
                <strong>${escapeHtml(t('account.profilePhoto'))}</strong>
                <span>${escapeHtml(t('account.profilePhotoDesc'))}</span>
              </div>
            </div>
            <div class="auth-profile-static">
              <strong>${escapeHtml(t('account.loginEmail'))}</strong>
              <span>${escapeHtml(profile.email || '')}</span>
              <p class="auth-profile-note">${escapeHtml(t('account.loginEmailNote'))}</p>
            </div>
          </div>
          <form id="profileEditForm" class="auth-form auth-profile-form">
            <input type="hidden" name="remove_avatar" id="profileRemoveAvatar" value="${state.pendingProfileRemoveAvatar ? '1' : '0'}" />
            <div class="auth-profile-grid">
              <div class="form-group form-group-full">
                <label>${escapeHtml(t('account.profilePhoto'))}</label>
                <div class="auth-avatar-picker-row">
                  <button type="button" class="btn btn-secondary btn-inline" id="chooseAvatarBtn">${escapeHtml(t('account.choosePhoto'))}</button>
                  <button type="button" class="btn btn-secondary btn-inline" id="removeAvatarBtn">${escapeHtml(t('account.useGenericAvatar'))}</button>
                </div>
                <div class="auth-profile-note">${escapeHtml(t('account.photoNote'))}</div>
                <div class="auth-profile-note" id="profileAvatarStatus">${escapeHtml(state.pendingProfileAvatarFile?.name ? t('account.selectedFile', { name: state.pendingProfileAvatarFile.name }) : (state.pendingProfileRemoveAvatar ? t('account.usingGenericAvatar') : t('account.noNewFile')))}</div>
              </div>
              <div class="form-group">
                <label for="profileFullName">${escapeHtml(t('account.fullName'))}</label>
                <input id="profileFullName" name="full_name" type="text" required autocomplete="name" value="${escapeAttr(profile.full_name)}" />
              </div>
              <div class="form-group">
                <label for="profilePhone">${escapeHtml(t('account.phoneNumber'))}</label>
                <input id="profilePhone" name="phone" type="tel" required autocomplete="tel" value="${escapeAttr(profile.phone)}" />
              </div>
              <div class="form-group">
                <label for="profileGender">${escapeHtml(t('account.profileGender'))}</label>
                <select id="profileGender" name="gender">
                  <option value="">${escapeHtml(t('gender.chooseLater'))}</option>
                  ${buildGenderOptionsHtml(profile.gender)}
                </select>
              </div>
              <div class="form-group">
                <label for="profileAge">${escapeHtml(t('account.profileAge'))}</label>
                <input id="profileAge" name="age" type="number" min="1" max="120" inputmode="numeric" value="${escapeAttr(profile.age)}" />
              </div>
              <div class="form-group">
                <label for="profileEmergencyName">${escapeHtml(t('account.emergencyName'))}</label>
                <input id="profileEmergencyName" name="emergency_contact_name" type="text" autocomplete="name" value="${escapeAttr(profile.emergency_contact_name)}" />
              </div>
              <div class="form-group">
                <label for="profileEmergencyPhone">${escapeHtml(t('account.emergencyPhone'))}</label>
                <input id="profileEmergencyPhone" name="emergency_contact_phone" type="tel" autocomplete="tel" value="${escapeAttr(profile.emergency_contact_phone)}" />
              </div>
              <div class="form-group form-checkbox-group form-group-full">
                <label class="checkbox-row auth-checkbox-row" for="profileMarketingOptIn">
                  <input id="profileMarketingOptIn" name="marketing_opt_in" type="checkbox" ${profile.marketing_opt_in ? 'checked' : ''} />
                  <span>${escapeHtml(t('account.newsOptIn'))}</span>
                </label>
              </div>
              <div class="form-group form-group-full">
                <label for="profileAllergies">${escapeHtml(t('account.foodAllergies'))}</label>
                <textarea id="profileAllergies" name="food_allergies" rows="3" placeholder="${escapeAttr(t('account.foodAllergiesPlaceholder'))}">${escapeHtml(profile.food_allergies)}</textarea>
              </div>
              <div class="form-group form-group-full">
                <label for="profileMedical">${escapeHtml(t('account.medicalNotes'))}</label>
                <textarea id="profileMedical" name="medical_conditions" rows="3" placeholder="${escapeAttr(t('account.medicalPlaceholder'))}">${escapeHtml(profile.medical_conditions)}</textarea>
              </div>
            </div>
            <div class="auth-actions">
              <button type="submit" class="btn btn-primary">${escapeHtml(t('account.saveProfile'))}</button>
              <button type="button" class="btn btn-secondary" id="cancelProfileEditBtn">${escapeHtml(t('account.cancel'))}</button>
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
        <span class="auth-status-pill">${escapeHtml(t('account.signedIn'))}</span>
        <div>
          <h2 class="auth-title" id="authModalTitle">${escapeHtml(t('account.yourAccount'))}</h2>
          <p class="auth-muted">${escapeHtml(t('account.summaryDesc'))}</p>
        </div>
        ${state.paymentReturnNotice?.message ? `<div class="auth-notice ${escapeAttr(state.paymentReturnNotice.type || 'info')}">${escapeHtml(state.paymentReturnNotice.message)}</div>` : ''}
        <div class="auth-account-header">
          <img src="${escapeAttr(profile.avatar_url)}" alt="${escapeAttr(`${getUserDisplayName()} profile photo`)}" class="auth-avatar-image auth-avatar-image-large" />
          <div class="auth-account-header-copy">
            <h3>${escapeHtml(getProfileSummaryValue(profile.full_name, getUserDisplayName()))}</h3>
            <p>${escapeHtml(profile.email || '')}</p>
            <span>${escapeHtml(getGenderLabel(profile.gender, t('gender.notSavedYet')))}</span>
          </div>
        </div>
        <div class="auth-summary-grid">
          <div class="auth-summary-item">
            <strong>${escapeHtml(t('account.name'))}</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.full_name, getUserDisplayName()))}</span>
          </div>
          <div class="auth-summary-item">
            <strong>${escapeHtml(t('account.email'))}</strong>
            <span>${escapeHtml(profile.email || '')}</span>
          </div>
          <div class="auth-summary-item">
            <strong>${escapeHtml(t('account.phone'))}</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.phone))}</span>
          </div>
          <div class="auth-summary-item">
            <strong>${escapeHtml(t('account.age'))}</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.age))}</span>
          </div>
          <div class="auth-summary-item">
            <strong>${escapeHtml(t('account.gender'))}</strong>
            <span>${escapeHtml(getGenderLabel(profile.gender))}</span>
          </div>
          <div class="auth-summary-item">
            <strong>${escapeHtml(t('account.newsUpdates'))}</strong>
            <span>${profile.marketing_opt_in ? escapeHtml(t('account.subscribed')) : escapeHtml(t('account.notSubscribed'))}</span>
          </div>
          <div class="auth-summary-item full-width">
            <strong>${escapeHtml(t('account.emergencyContact'))}</strong>
            <span>${escapeHtml(profile.emergency_contact_name && profile.emergency_contact_phone ? `${profile.emergency_contact_name} · ${profile.emergency_contact_phone}` : profile.emergency_contact_name || profile.emergency_contact_phone || t('common.notSavedYet'))}</span>
          </div>
          <div class="auth-summary-item full-width">
            <strong>${escapeHtml(t('account.foodAllergies'))}</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.food_allergies, t('common.nothingSavedYet')))}</span>
          </div>
          <div class="auth-summary-item full-width">
            <strong>${escapeHtml(t('account.medicalNotes'))}</strong>
            <span>${escapeHtml(getProfileSummaryValue(profile.medical_conditions, t('common.nothingSavedYet')))}</span>
          </div>
        </div>
        ${getMyRegistrationsMarkup()}
        <div class="auth-actions">
          <button type="button" class="btn btn-primary" id="editProfileBtn">${escapeHtml(t('account.editProfile'))}</button>
          ${isAccountPage()
            ? `<a href="index.html#events" class="btn btn-secondary" id="closeAuthAndBrowseBtn">${escapeHtml(t('account.continueBooking'))}</a>`
            : `<button type="button" class="btn btn-secondary" id="closeAuthAndBrowseBtn">${escapeHtml(t('account.continueBooking'))}</button>`}
          <button type="button" class="btn btn-secondary" id="logoutAccountBtn">${escapeHtml(t('account.logOut'))}</button>
        </div>
      </div>`;

    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
      clearPendingProfileAvatarState();
      state.accountMode = 'edit';
      renderAuthModal();
    });
    if (!isAccountPage()) document.getElementById('closeAuthAndBrowseBtn')?.addEventListener('click', closeAuthModal);
    document.getElementById('logoutAccountBtn')?.addEventListener('click', logoutCurrentUser);
    document.getElementById('retryMyRegistrationsBtn')?.addEventListener('click', () => loadMyRegistrations({ force: true }));
    document.getElementById('loadMorePastRegistrationsBtn')?.addEventListener('click', () => {
      state.visiblePastRegistrations += 5;
      renderAuthModal();
    });
    mount.querySelectorAll('[data-open-booking-event-id]').forEach((button) => {
      button.addEventListener('click', () => {
        closeAuthModal();
        openEventModal(button.dataset.openBookingEventId);
      });
    });
    mount.querySelectorAll('[data-account-open-event-id]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const eventId = String(link.dataset.accountOpenEventId || '').trim();
        if (!eventId) return;
        event.preventDefault();
        queueRequestedEventId(eventId);
        window.location.assign(buildEventOpenUrl(eventId));
      });
    });
    return;
  }

  mount.innerHTML = `
    <div class="auth-card">
      <div>
        <h2 class="auth-title" id="authModalTitle">${escapeHtml(t('account.accountTitle'))}</h2>
        <p class="auth-muted">${escapeHtml(t('account.accountIntro'))}</p>
      </div>
      <div class="auth-switch" role="tablist" aria-label="Choose account action">
        <button type="button" class="auth-switch-btn ${state.authView === 'login' ? 'active' : ''}" data-auth-view="login">${escapeHtml(t('account.switchLogin'))}</button>
        <button type="button" class="auth-switch-btn ${state.authView === 'signup' ? 'active' : ''}" data-auth-view="signup">${escapeHtml(t('account.switchSignup'))}</button>
      </div>
      ${state.authNotice ? `<div class="auth-notice ${escapeAttr(state.authNotice.type || 'info')}">${escapeHtml(state.authNotice.message)}</div>` : ''}
      ${state.authView === 'signup' ? `
        <form id="signupForm" class="auth-form">
          <div class="form-group">
            <label for="signupFullName">${escapeHtml(t('account.fullName'))}</label>
            <input id="signupFullName" name="full_name" type="text" required autocomplete="name" />
          </div>
          <div class="form-group">
            <label for="signupPhone">${escapeHtml(t('account.phoneNumber'))}</label>
            <input id="signupPhone" name="phone" type="tel" required autocomplete="tel" />
          </div>
          <div class="form-group">
            <label for="signupEmail">${escapeHtml(t('account.email'))} *</label>
            <input id="signupEmail" name="email" type="email" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label for="signupPassword">${escapeHtml(t('account.password'))}</label>
            <input id="signupPassword" name="password" type="password" minlength="6" required autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label for="signupConfirmPassword">${escapeHtml(t('account.confirmPassword'))}</label>
            <input id="signupConfirmPassword" name="confirm_password" type="password" minlength="6" required autocomplete="new-password" />
          </div>
          <div class="form-group form-checkbox-group">
            <label class="checkbox-row auth-checkbox-row" for="signupMarketingOptIn">
              <input id="signupMarketingOptIn" name="marketing_opt_in" type="checkbox" />
              <span>${escapeHtml(t('account.newsOptIn'))}</span>
            </label>
            <p class="auth-optin-note">${escapeHtml(t('account.optInNote'))}</p>
          </div>
          <button type="submit" class="btn btn-primary">${escapeHtml(t('account.createAccount'))}</button>
          <p class="auth-confirm-hint">${escapeHtml(t('account.confirmEmailHint'))}</p>
        </form>
      ` : `
        <form id="loginForm" class="auth-form" autocomplete="on">
          <div class="form-group">
            <label for="loginEmail">${escapeHtml(t('account.email'))} *</label>
            <input
              id="loginEmail"
              name="email"
              type="email"
              required
              autocomplete="username"
              inputmode="email"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
            />
          </div>
          <div class="form-group">
            <label for="loginPassword">${escapeHtml(t('account.password'))}</label>
            <input
              id="loginPassword"
              name="password"
              type="password"
              required
              autocomplete="current-password"
              autocapitalize="none"
              autocorrect="off"
              spellcheck="false"
            />
          </div>
          <button type="submit" class="btn btn-primary">${escapeHtml(t('account.login'))}</button>
        </form>
      `}
      <p class="auth-helper">${escapeHtml(t('account.helperGuest'))}</p>
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
  button.textContent = t('account.loggingIn');

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    state.user = data.user || null;
    state.accountMode = 'summary';
    setAuthNotice();
    refreshAuthDependentUI();
    showToast(t('account.loginSuccess'), 'success');
    closeAuthModal();
  } catch (error) {
    console.error('Login error:', error);
    const errorMessage = error?.message || t('account.loginFailed');
    if (/email not confirmed/i.test(errorMessage)) {
      setAuthNotice(t('account.loginErrorUnconfirmed'), 'info');
      renderAuthModal();
      const loginEmail = document.getElementById('loginEmail');
      if (loginEmail) loginEmail.value = email;
      showToast(t('account.loginErrorUnconfirmed'), 'error');
    } else {
      showToast(errorMessage, 'error');
    }
    button.disabled = false;
    button.textContent = t('account.login');
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
    showToast(t('account.signupPasswordMismatch'), 'error');
    const confirmInput = document.getElementById('signupConfirmPassword');
    if (confirmInput) {
      confirmInput.value = '';
      confirmInput.focus();
    }
    return;
  }

  button.disabled = true;
  button.textContent = t('account.creatingAccount');

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
      showToast(t('account.accountCreatedAndLoggedIn'), 'success');
      closeAuthModal();
      return;
    }

    try {
      const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      state.user = loginData?.user || data.user || null;
      state.accountMode = 'summary';
      setAuthNotice();
      refreshAuthDependentUI();
      loadMyRegistrations({ force: true });
      showToast(t('account.accountCreatedAndLoggedIn'), 'success');
      closeAuthModal();
      return;
    } catch (loginAfterSignupError) {
      console.warn('Immediate login after signup was not available:', loginAfterSignupError);
    }

    state.authView = 'login';
    setAuthNotice(t('account.accountCreatedFor', { email }), 'success');
    renderAuthModal();
    const loginEmail = document.getElementById('loginEmail');
    if (loginEmail) loginEmail.value = email;
    showToast(t('account.accountCreatedConfirm'), 'success');
  } catch (error) {
    console.error('Signup error:', error);
    showToast(error.message || t('account.accountCreationFailed'), 'error');
    button.disabled = false;
    button.textContent = t('account.createAccount');
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
    showToast(t('account.logoutSuccess'), 'success');
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
      setStatus(t('account.selectedFile', { name: state.pendingProfileAvatarFile.name }));
      return;
    }

    if (state.pendingProfileRemoveAvatar) {
      preview.src = fallbackSrc;
      removeInput.value = '1';
      setStatus(t('account.usingGenericAvatar'));
      return;
    }

    preview.src = profile.avatar_url || fallbackSrc;
    removeInput.value = '0';
    setStatus(t('account.noNewFile'));
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
        showToast(t('account.avatarFileTypeError'), 'error');
        return;
      }

      if (selectedFile.size > 5 * 1024 * 1024) {
        applyPendingAvatarUi();
        showToast(t('account.avatarFileSizeError'), 'error');
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
        setStatus(t('account.selectedFile', { name: selectedFile.name }));

        try {
          state.pendingProfileAvatarPreviewUrl = URL.createObjectURL(blob);
          preview.src = state.pendingProfileAvatarPreviewUrl;
        } catch (previewError) {
          console.warn('Avatar preview creation failed:', previewError);
          preview.src = profile.avatar_url || fallbackSrc;
          setStatus(t('account.selectedFileNoPreview', { name: selectedFile.name }));
        }
      } catch (readError) {
        console.error('Avatar file read failed:', readError);
        clearPendingProfileAvatarState();
        applyPendingAvatarUi();
        showToast(t('account.avatarReadError'), 'error');
      }
    }, { once: true });

    picker.click();
  });

  removeButton.addEventListener('click', () => {
    clearPendingProfileAvatarState({ keepRemove: true });
    state.pendingProfileRemoveAvatar = true;
    removeInput.value = '1';
    preview.src = fallbackSrc;
    setStatus(t('account.usingGenericAvatar'));
  });
}

async function uploadAvatarFile(file) {
  if (!state.user?.id) throw new Error(t('account.avatarNeedLogin'));
  if (!file) return null;
  if (!isSupportedAvatarFile(file)) throw new Error(t('account.avatarFileTypeError'));
  if (file.size > 5 * 1024 * 1024) throw new Error(t('account.avatarFileSizeError'));

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
      throw new Error(t('account.avatarPrepareError'));
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
    showToast(t('account.saveNamePhoneError'), 'error');
    return;
  }

  button.disabled = true;
  button.textContent = t('account.savingProfile');

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
    showToast(t('account.profileSaved'), 'success');
  } catch (error) {
    console.error('Profile save error:', error);
    showToast(error.message || t('account.profileSaveFailed'), 'error');
    button.disabled = false;
    button.textContent = t('account.saveProfile');
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

  if (state.user && isAccountPage() && state.accountMode === 'summary') {
    try {
      await loadMyRegistrations({ force: true });
      renderAuthModal();
    } catch (error) {
      console.error('Account registrations refresh error:', error);
    }
  }

  handleAccountPaymentReturn();
}

function initAuth() {
  if (!state.user) {
    state.authView = getRequestedAuthView();
  }
  if (isAccountPage()) {
    state.paymentReturn = getAccountPaymentReturnFromUrl();
    state.paymentReturnNotice = null;
  }
  if (isAccountPage()) bindAccountPageStaticAuth();
  refreshAuthDependentUI();

  document.getElementById('accountBtn')?.addEventListener('click', (event) => {
    const navLinks = document.getElementById('navLinks');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (navLinks?.classList.contains('active')) {
      navLinks.classList.remove('active');
      mobileMenuBtn?.setAttribute('aria-expanded', 'false');
    }
    if (isAccountPage()) {
      openAuthModal('login', event.currentTarget);
      return;
    }
    event.preventDefault();
    goToAccountPage(state.user ? 'login' : 'login');
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

  if (isAccountPage()) {
    renderAuthModal();
  }

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
      resetClaimRegistrationsState();
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
      basePriceChf: Number(event.base_price_chf || 0),
      photoUrl: event.photo_url || '',
      photoPath: event.photo_path || '',
      registrationOpen: event.registration_open !== false,
      sessions: (sessions || [])
        .filter((session) => session.event_id === event.id)
        .map((session) => ({
          id: session.id,
          title: session.title,
          startTime: session.start_time,
          endTime: session.end_time,
          exerciseType: session.exercise_type,
          maxParticipants: Number(session.max_participants || 0),
          registered: Number(session.registered_count || 0),
          priceChf: Number(session.price_chf || 0),
          registrationOpen: session.registration_open !== false
        }))
    }));
  } catch (error) {
    console.error('Failed to load events:', error);
    showToast('Failed to load events. Please refresh.', 'error');
    state.events = [];
  } finally {
    state.eventsLoaded = true;
  }

  renderEvents();
  renderCalendar();
  updateEmptyState();
  scheduleHeroSideCardRender();
  observeAnimatable();
}

function isEventRegistrationOpen(event) {
  return event?.registrationOpen !== false;
}

function isSessionRegistrationOpen(session) {
  return session?.registrationOpen !== false;
}

function getVisibleSessions(event) {
  return Array.isArray(event?.sessions) ? event.sessions : [];
}

function getPublicSessions(event) {
  return getVisibleSessions(event).filter((session) => isSessionRegistrationOpen(session));
}

function isEventBookable(event) {
  return isEventRegistrationOpen(event) && getPublicSessions(event).length > 0;
}

function getUpcomingEvents() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return state.events
    .filter((event) => new Date(event.date) >= today)
    .filter((event) => getVisibleSessions(event).length > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function getUpcomingBookableEvents() {
  return getUpcomingEvents().filter((event) => isEventBookable(event));
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
    const visibleSessions = getVisibleSessions(event);
    const publicSessions = getPublicSessions(event);
    const isClosed = !isEventRegistrationOpen(event);
    const isSoldOut = !isClosed && publicSessions.length > 0 && publicSessions.every((session) => session.registered >= session.maxParticipants);
    const totalSpots = visibleSessions.reduce((sum, session) => sum + Number(session.maxParticipants || 0), 0);
    const totalRegistered = visibleSessions.reduce((sum, session) => sum + Number(session.registered || 0), 0);
    const fillPercentage = totalSpots ? (totalRegistered / totalSpots) * 100 : 0;
    const cardClasses = ['event-card'];
    if (isClosed) cardClasses.push('event-card-closed');

    const participantLabel = getCountLabel('events.joining', totalRegistered);
    const sessionsLabel = getCountLabel('events.sessionsLabel', visibleSessions.length);
    const statusCopy = isClosed
      ? t('events.closedCardDesc')
      : isSoldOut
        ? t('events.soldOutCardDesc')
        : t('events.openCardDesc');

    return `
      <article class="${cardClasses.join(' ')}" tabindex="${isClosed ? '-1' : '0'}" data-event-id="${escapeAttr(event.id)}" aria-disabled="${isClosed ? 'true' : 'false'}">
        <div class="event-image ${getEventPhotoUrl(event) ? 'has-photo' : ''}" data-location="${escapeAttr(getEventLocationMarker(event))}">
          ${getEventPhotoUrl(event) ? `<img class="event-image-photo" src="${escapeAttr(getEventPhotoUrl(event))}" alt="${escapeAttr(event.title)}">` : ''}
          ${isClosed
            ? `<span class="event-badge event-badge-closed">${escapeHtml(t('events.closed'))}</span>`
            : isSoldOut
              ? `<span class="event-badge sold-out">${escapeHtml(t('events.soldOut'))}</span>`
              : fillPercentage > 80
                ? `<span class="event-badge">${escapeHtml(t('events.almostFull'))}</span>`
                : ''}
          ${getEventPhotoUrl(event) ? '' : `<span class="event-image-caption">${escapeHtml(getEventLocationMarker(event))}</span>`}
        </div>
        <div class="event-content">
          <div class="event-date">${formatDate(event.date)}</div>
          <h3 class="event-title">${escapeHtml(event.title)}</h3>
          <p class="event-location">${escapeHtml(event.location)}</p>
          <div class="event-meta-chips">
            <span class="event-meta-chip">${escapeHtml(participantLabel)}</span>
            <span class="event-meta-chip">${escapeHtml(sessionsLabel)}</span>
            <span class="event-meta-chip">${escapeHtml(t('events.equipmentIncluded'))}</span>
          </div>
          <p class="event-summary">${escapeHtml(getEventSummaryCopy(event))}</p>
          <div class="event-sessions">
            ${visibleSessions.map((session) => {
              const isSessionClosed = isClosed || !isSessionRegistrationOpen(session);
              const isFull = !isSessionClosed && session.registered >= session.maxParticipants;
              const percentage = session.maxParticipants ? (session.registered / session.maxParticipants) * 100 : 0;
              return `
                <div class="session-row ${isFull ? 'full' : ''} ${isSessionClosed ? 'session-row-closed' : ''}">
                  <div class="session-info">
                    <span class="session-time">${escapeHtml(session.startTime)} - ${escapeHtml(session.endTime)}</span>
                    <span class="session-type">${escapeHtml(session.exerciseType)}</span>
                    ${getSessionPriceLabel(event, session) ? `<span style="display:block;margin-top:4px;font-size:0.85rem;opacity:0.9;">${getSessionPriceLabel(event, session)}</span>` : ''}
                    ${isSessionClosed ? `<span class="session-note">${escapeHtml(t('events.closed'))}</span>` : ''}
                  </div>
                  <div class="session-capacity">
                    <div class="capacity-bar"><div class="capacity-fill ${isFull ? 'full' : ''}" style="width:${percentage}%"></div></div>
                    <span class="capacity-text">${session.registered}/${session.maxParticipants}</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
          <div class="event-card-footer">
            <span class="event-status-copy">${escapeHtml(statusCopy)}</span>
            <span class="event-detail-link">${escapeHtml(t('events.viewDetails'))}</span>
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
    const publicSessions = getPublicSessions(event);
    const isClosed = !isEventRegistrationOpen(event);
    const totalSpots = publicSessions.reduce((sum, session) => sum + session.maxParticipants, 0);
    const totalRegistered = publicSessions.reduce((sum, session) => sum + session.registered, 0);
    const availableSpots = totalSpots - totalRegistered;

    let statusClass = 'available';
    let statusText = t('events.open');
    if (isClosed) {
      statusClass = 'closed';
      statusText = t('events.closed');
    } else if (availableSpots <= 0) {
      statusClass = 'sold-out';
      statusText = t('events.soldOut');
    } else if (availableSpots < 10) {
      statusClass = 'limited';
      statusText = t('events.limited');
    }

    return `
      <div class="calendar-item ${isClosed ? 'calendar-item-closed' : ''}" tabindex="${isClosed ? '-1' : '0'}" data-event-id="${escapeAttr(event.id)}" aria-disabled="${isClosed ? 'true' : 'false'}">
        <div class="calendar-date">
          <span class="day">${date.getDate()}</span>
          <span class="month">${date.toLocaleString(getLocale(), { month: 'short' })}</span>
        </div>
        <div class="calendar-info">
          <h4>${escapeHtml(event.title)}</h4>
          <p>${escapeHtml(event.location)}</p>
        </div>
        <span class="calendar-status ${statusClass}">${escapeHtml(statusText)}</span>
      </div>`;
  }).join('');

  bindEventLaunchers(container.querySelectorAll('.calendar-item'));
}

function bindEventLaunchers(nodes) {
  nodes.forEach((node) => {
    if (node.getAttribute('aria-disabled') === 'true') return;

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
  if (!event || !isEventBookable(event)) {
    showToast(t('events.closed'), 'error');
    return;
  }
  state.currentEvent = event;
  state.selectedSessionId = null;

  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  if (!overlay || !content) return;
  content.innerHTML = renderEventModal(event);

  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  bindModalActions();
  setTimeout(() => document.getElementById('modalClose')?.focus(), 20);
}

function handleRequestedEventOpen() {
  if (isAccountPage()) return;
  const requestedEventId = getRequestedEventIdFromUrl() || getQueuedRequestedEventId();
  if (!requestedEventId) return;

  const requestedEvent = state.events.find((item) => item.id === requestedEventId);
  if (!requestedEvent || !isEventBookable(requestedEvent)) {
    clearRequestedEventIdFromUrl();
    clearQueuedRequestedEventId();
    return;
  }

  const eventsSection = document.getElementById('events');
  if (eventsSection) {
    const offsetTop = eventsSection.offsetTop - 80;
    window.scrollTo({ top: offsetTop, behavior: 'smooth' });
  }

  setTimeout(() => {
    openEventModal(requestedEventId);
    clearRequestedEventIdFromUrl();
    clearQueuedRequestedEventId();
  }, 220);
}

function renderEventModal(event) {
  const eventPhotoUrl = getEventPhotoUrl(event);
  const visibleSessions = getVisibleSessions(event);
  const publicSessions = getPublicSessions(event);
  const participantCount = visibleSessions.reduce((sum, session) => sum + Number(session.registered || 0), 0);
  return `
    <div class="modal-header">
      ${eventPhotoUrl ? `<div class="modal-event-photo"><img src="${escapeAttr(eventPhotoUrl)}" alt="${escapeAttr(event.title)}"></div>` : ''}
      <h2 id="modalTitle">${escapeHtml(event.title)}</h2>
      <p>${formatDate(event.date)} · ${escapeHtml(event.location)}</p>
      ${event.description ? `<p style="margin-top:8px;">${escapeHtml(event.description)}</p>` : ''}
      <div class="event-meta-chips modal-meta-chips">
        <span class="event-meta-chip">${escapeHtml(getCountLabel('events.joining', participantCount))}</span>
        <span class="event-meta-chip">${escapeHtml(t('events.equipmentIncluded'))}</span>
        <span class="event-meta-chip">${escapeHtml(t('events.modalMixedLevels'))}</span>
      </div>
    </div>
    <div class="modal-sessions" role="list">
      ${publicSessions.map((session) => {
        const isFull = session.registered >= session.maxParticipants;
        const available = Math.max(0, session.maxParticipants - session.registered);
        const priceLabel = getSessionPriceLabel(event, session);
        const buttonLabel = isFull
          ? t('booking.full')
          : (state.user ? t('booking.register') : t('booking.loginRequiredCta'));
        return `
          <div class="modal-session ${isFull ? 'full' : ''}" role="listitem">
            <div class="modal-session-info">
              <h4>${escapeHtml(session.title)}</h4>
              <p>${escapeHtml(session.startTime)} - ${escapeHtml(session.endTime)} · ${escapeHtml(session.exerciseType)}</p>
              ${priceLabel ? `<p class="modal-price">${priceLabel}</p>` : ''}
            </div>
            <div class="modal-session-capacity">
              <div class="spots ${isFull ? 'full' : ''}">${available}</div>
              <div class="label">${escapeHtml(isFull ? t('booking.full') : t('booking.spotsLeft'))}</div>
            </div>
            <button class="btn-register" data-session-id="${escapeAttr(session.id)}" ${isFull ? 'disabled' : ''}>${escapeHtml(buttonLabel)}</button>
          </div>`;
      }).join('')}
    </div>
    <div class="modal-logistics-box">
      <strong>${escapeHtml(t('events.modalLogisticsTitle'))}</strong>
      <p>${escapeHtml(t('events.modalLogisticsDesc'))}</p>
      <div class="event-meta-chips modal-meta-chips">
        <span class="event-meta-chip">${escapeHtml(t('events.modalWeather'))}</span>
        <span class="event-meta-chip">${escapeHtml(t('events.modalAccountRequired'))}</span>
      </div>
    </div>
    <div id="registrationFormMount"></div>`;
}

function bindModalActions() {
  document.querySelectorAll('.btn-register[data-session-id]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.user) {
        showToast(t('booking.loginRequiredToast'), 'error');
        openAuthModal('login', button);
        return;
      }
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

  if (!state.user) {
    mount.innerHTML = `<div class="registration-panel"><div class="auth-registration-banner">${escapeHtml(t('booking.guestBanner'))} <button type="button" class="auth-inline-btn" id="openAuthFromRegistration">${escapeHtml(t('booking.guestBannerCta'))}</button>${escapeHtml(t('booking.guestBannerSuffix'))}</div></div>`;
    document.getElementById('openAuthFromRegistration')?.addEventListener('click', () => openAuthModal('login', document.getElementById('openAuthFromRegistration')));
    return;
  }

  const authBanner = `<div class="auth-registration-banner logged-in"><strong>${escapeHtml(t('booking.signedInBanner', { name: getUserDisplayName() }))}</strong><br>${escapeHtml(t('booking.signedInBannerDesc'))}</div>`;

  mount.innerHTML = `
    <div class="registration-panel">
      <div class="registration-panel-header">
        <h3>${escapeHtml(t('booking.registerFor', { session: session.title }))}</h3>
        <p>${escapeHtml(session.startTime)} - ${escapeHtml(session.endTime)} · ${escapeHtml(session.exerciseType)}</p>
        ${getSessionPriceLabel(event, session) ? `<p class="modal-price">${getSessionPriceLabel(event, session)}</p>` : ''}
      </div>
      ${authBanner}
      <form id="sessionRegistrationForm" class="registration-form-grid">
        <div class="form-group">
          <label for="regFullName">${escapeHtml(t('booking.fullName'))}</label>
          <input id="regFullName" name="full_name" type="text" required autocomplete="name" />
        </div>
        <div class="form-group">
          <label for="regEmail">${escapeHtml(t('booking.email'))}</label>
          <input id="regEmail" name="email" type="email" required autocomplete="email" />
        </div>
        <div class="form-group">
          <label for="regPhone">${escapeHtml(t('booking.phone'))}</label>
          <input id="regPhone" name="phone" type="tel" required autocomplete="tel" />
        </div>
        <div class="form-group">
          <label for="regAge">${escapeHtml(t('booking.age'))}</label>
          <input id="regAge" name="age" type="number" min="1" max="120" required inputmode="numeric" />
        </div>
        <div class="form-group">
          <label for="regGender">${escapeHtml(t('booking.gender'))}</label>
          <select id="regGender" name="gender" required>
            ${buildGenderOptionsHtml('', true)}
          </select>
        </div>
        <div class="form-group form-group-full">
          <label for="regAllergies">${escapeHtml(t('booking.foodAllergies'))}</label>
          <textarea id="regAllergies" name="food_allergies" rows="3" placeholder="${escapeAttr(t('booking.allergiesPlaceholder'))}"></textarea>
        </div>
        <div class="form-group form-group-full">
          <label for="regMedical">${escapeHtml(t('booking.medical'))}</label>
          <textarea id="regMedical" name="medical_conditions" rows="3" placeholder="${escapeAttr(t('booking.medicalPlaceholder'))}"></textarea>
        </div>
        <div class="form-group">
          <label for="regEmergencyName">${escapeHtml(t('booking.emergencyName'))}</label>
          <input id="regEmergencyName" name="emergency_contact_name" type="text" required autocomplete="name" />
        </div>
        <div class="form-group">
          <label for="regEmergencyPhone">${escapeHtml(t('booking.emergencyPhone'))}</label>
          <input id="regEmergencyPhone" name="emergency_contact_phone" type="tel" required autocomplete="tel" />
        </div>
        <label class="checkbox-row form-group-full">
          <input id="regConsent" name="consent_given" type="checkbox" required />
          <span>${escapeHtml(t('booking.consent'))}</span>
        </label>
        <label class="checkbox-row form-group-full">
          <input id="regWaiver" name="waiver_accepted" type="checkbox" required />
          <span>${escapeHtml(t('booking.waiver'))}</span>
        </label>
        <div class="registration-actions form-group-full">
          <button type="submit" class="btn btn-primary">${escapeHtml(getBookingPriceChf(event, session) > 0 ? t('booking.continueToPayment') : t('booking.completeRegistration'))}</button>
          <button type="button" class="btn btn-secondary" id="cancelRegistrationBtn">${escapeHtml(t('booking.cancel'))}</button>
        </div>
      </form>
    </div>`;

  document.getElementById('sessionRegistrationForm').addEventListener('submit', submitRegistrationForm);
  populateRegistrationFormFromUser(document.getElementById('sessionRegistrationForm'));

  document.getElementById('cancelRegistrationBtn').addEventListener('click', () => {
    state.selectedSessionId = null;
    mount.innerHTML = '';
  });
  document.getElementById('regFullName').focus();
}

async function submitRegistrationForm(event) {
  event.preventDefault();
  if (!state.user) {
    showToast(t('booking.loginRequiredToast'), 'error');
    openAuthModal('login', event.currentTarget);
    return;
  }
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
    showToast(t('booking.completeRequired'), 'error');
    return;
  }

  const session = state.currentEvent?.sessions.find((item) => item.id === state.selectedSessionId);
  const isPaidSession = getBookingPriceChf(state.currentEvent, session) > 0;

  submitButton.disabled = true;
  submitButton.textContent = isPaidSession ? t('booking.redirectingToPayment') : t('booking.saving');

  try {
    if (isPaidSession) {
      await startPaidRegistration(payload, submitButton);
      return;
    }

    const { data, error } = await supabaseClient.rpc('register_for_session', payload);
    if (error) throw error;
    if (!data?.success) {
      showToast(data?.message || t('booking.failed'), 'error');
      submitButton.disabled = false;
      submitButton.textContent = t('booking.completeRegistration');
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

    showToast(emailSent ? t('booking.savedEmailSent') : t('booking.savedEmailPending'), emailSent ? 'success' : 'error');
    await loadEvents();
    if (state.user) await loadMyRegistrations({ force: true });
    closeModal();
  } catch (error) {
    console.error('Registration error:', error);
    showToast(error.message || t('booking.failed'), 'error');
    submitButton.disabled = false;
    submitButton.textContent = isPaidSession ? t('booking.continueToPayment') : t('booking.completeRegistration');
  }
}

function getSessionPriceLabel(event, session) {
  const sessionPrice = Number(session?.priceChf || 0);
  const eventPrice = Number(event?.basePriceChf || 0);
  const price = sessionPrice > 0 ? sessionPrice : eventPrice;

  return price > 0 ? `CHF ${price.toFixed(2)}` : '';
}

function getBookingPriceChf(event, session) {
  const sessionPrice = Number(session?.priceChf || session?.price_chf || 0);
  const eventPrice = Number(event?.basePriceChf || event?.base_price_chf || 0);
  return sessionPrice > 0 ? sessionPrice : eventPrice;
}

async function startPaidRegistration(payload, submitButton) {
  const response = await fetch('/.netlify/functions/create-payrexx-payment', {
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
        emergencyContactPhone: payload.p_emergency_contact_phone,
        consentGiven: payload.p_consent_given,
        waiverAccepted: payload.p_waiver_accepted
      },
      event: {
        id: state.currentEvent?.id || '',
        title: state.currentEvent?.title || '',
        date: state.currentEvent?.date || '',
        location: state.currentEvent?.location || ''
      },
      session: {
        id: state.selectedSessionId || '',
        title: state.currentEvent?.sessions.find((item) => item.id === state.selectedSessionId)?.title || '',
        startTime: state.currentEvent?.sessions.find((item) => item.id === state.selectedSessionId)?.startTime || '',
        endTime: state.currentEvent?.sessions.find((item) => item.id === state.selectedSessionId)?.endTime || '',
        exerciseType: state.currentEvent?.sessions.find((item) => item.id === state.selectedSessionId)?.exerciseType || '',
        priceChf: getBookingPriceChf(state.currentEvent, state.currentEvent?.sessions.find((item) => item.id === state.selectedSessionId))
      },
      language: state.language
    })
  });

  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    result = null;
  }

  if (!response.ok || !result?.success || !result?.redirectUrl) {
    throw new Error(result?.message || `Payment could not be started (${response.status}).`);
  }

  submitButton.textContent = t('booking.redirectingToPayment');
  window.location.href = result.redirectUrl;
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
        button.textContent = t('contact.sending');
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

function initFloatingHomeButton() {
  const button = document.getElementById('floatingHomeBtn');
  if (!button) return;

  const updateVisibility = () => {
    button.classList.add('is-visible');
  };

  if (!isAccountPage()) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      try { closeAuthModal(); } catch (error) {}
      try { closeModal(); } catch (error) {}
      const navLinks = document.getElementById('navLinks');
      const mobileMenuBtn = document.getElementById('mobileMenuBtn');
      if (navLinks?.classList.contains('active')) {
        navLinks.classList.remove('active');
        mobileMenuBtn?.setAttribute('aria-expanded', 'false');
      }
      document.body.style.overflow = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  window.addEventListener('scroll', updateVisibility, { passive: true });
  updateVisibility();
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
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(getLocale(), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(getLocale(), {
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
  initLanguage();
  initNavigation();
  initFloatingHomeButton();
  initModal();
  initForms();
  initAuth();

  if (isAccountPage()) {
    rerenderLanguageUI();
    return;
  }

  await loadEvents();
  handleRequestedEventOpen();
});
