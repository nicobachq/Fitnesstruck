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



const TRANSLATIONS = {
  it: {
    meta: {
      title: 'Fitness Truck | La palestra che si muove',
      description: 'Allenamento outdoor premium in Ticino. Piccoli gruppi, coaching esperto, luoghi straordinari e sessioni pensate per farti prenotare subito.'
    },
    nav: {
      events: 'Eventi',
      experience: 'Esperienza',
      team: 'Team',
      contact: 'Contatti',
      account: 'Account',
      myAccount: 'Il mio account',
      openAccount: 'Apri account',
      openAccountFor: 'Apri l\'account di {name}'
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
      badge: 'Allenamento outdoor in Ticino',
      subtitle: 'Allenamento outdoor premium nei luoghi più suggestivi del Ticino. Piccoli gruppi, coaching esperto e sessioni pensate per metterti alla prova, darti energia e lasciarti qualcosa addosso.',
      statStops: 'Tappe in Ticino',
      statSpots: 'Posti/sessione',
      statEvents: 'Eventi/anno',
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
      accountCardDesc: 'Prenota più velocemente, salva i tuoi dati una volta sola e resta vicino alla prossima activation in Ticino.',
      fasterBookings: 'Prenotazioni future più veloci',
      newsOptIn: 'Aggiornamenti eventi facoltativi',
      guestBooking: 'La prenotazione ospite resta disponibile'
    },
    events: {
      sectionEyebrow: 'Prossimi eventi',
      sectionTitleHtml: 'Assicura il tuo <span class="text-accent">posto</span>',
      sectionDesc: 'Sessioni outdoor in Ticino a capacità limitata. Prenota presto per allenarti in luoghi eccezionali con coaching esperto e un\'atmosfera di gruppo che si sente subito speciale.',
      emptyTitle: 'Nessun evento in arrivo',
      emptyDesc: 'La prossima activation sta prendendo forma. Crea il tuo account per essere pronto nel momento in cui apriamo nuove date.',
      emptyCta: 'Crea account',
      calendarTitle: 'Calendario in arrivo',
      soldOut: 'Completo',
      almostFull: 'Quasi completo',
      open: 'Aperto',
      limited: 'Limitato'
    },
    experience: {
      eyebrow: 'L\'esperienza',
      titleHtml: 'Come <span class="text-accent">funziona</span>',
      desc: 'Dall\'account all\'activation, il processo è semplice, veloce e pensato per mantenere l\'esperienza premium.',
      step1Title: 'Scegli la tua sessione',
      step1Desc: 'Sfoglia il calendario in arrivo e scegli l\'evento che si adatta alla tua energia, al tuo tempo e al tipo di luogo in cui vuoi allenarti.',
      step2Title: 'Riserva il tuo posto',
      step2Desc: 'I posti restano volutamente limitati. Prenota in pochi clic e ricevi tutto quello che ti serve prima dell\'evento.',
      step3Title: 'Allenati all\'aperto',
      step3Desc: 'Presentati pronto. Noi portiamo truck, coaching, attrezzatura e l\'atmosfera che trasforma l\'allenamento in qualcosa che ricordi.'
    },
    expect: {
      eyebrow: 'Cosa aspettarti',
      titleHtml: 'Più di un <span class="text-accent">workout</span>',
      desc: 'Ogni activation unisce performance, atmosfera e luoghi indimenticabili in tutto il Ticino.',
      feature1: 'Performance funzionale',
      feature2: 'Mobilità e recupero',
      feature3: 'Allenamento della forza',
      feature4: 'Endurance',
      feature5: 'Coaching esperto',
      feature6: 'Attrezzatura premium',
      photo1: 'Workout dinamici',
      photo2: 'Coaching esperto',
      photo3: 'Luoghi straordinari',
      card1Title: 'Pensato per energia vera',
      card1Desc: 'Aspettati sessioni che combinano forza, conditioning, qualità del movimento e coaching preciso. Abbastanza intense da spingerti, abbastanza accessibili da farti tornare.',
      card2Title: 'Pensato per restarti dentro',
      card2Desc: 'Non stai semplicemente entrando in un workout. Stai entrando in un\'esperienza di allenamento outdoor premium modellata da luogo, persone ed energia.'
    },
    team: {
      eyebrow: 'Il team',
      titleHtml: 'Coaching con <span class="text-accent">visione</span>',
      desc: 'Un progetto costruito su performance, cura e sull\'idea che allenarsi debba sentirsi potente, umano e memorabile.',
      nicolasBio: 'Dà forma al concetto e all\'esperienza Fitness Truck, trasformando l\'allenamento in qualcosa che le persone si portano dietro anche dopo la sessione.',
      nazarenoBio: 'Porta struttura, intensità e profondità di coaching a ogni activation, aiutando le persone a muoversi meglio e ad allenarsi con uno scopo.',
      lorenzoBio: 'Sostiene recupero, resilienza e benessere fisico nel lungo periodo, aggiungendo un livello di cura ancora più profondo all\'esperienza.'
    },
    contact: {
      eyebrow: 'Contatti',
      titleHtml: 'Restiamo in <span class="text-accent">contatto</span>',
      desc: 'Domande, collaborazioni o idee per eventi privati? Saremo felici di sentirti.',
      email: 'Email',
      phone: 'Telefono',
      instagram: 'Instagram',
      locations: 'Luoghi',
      locationsValue: 'Prima il Ticino · pronti a muoverci oltre',
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
      tagline: 'Allenamento outdoor premium, nato in Ticino.',
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
      accountIntro: 'Crea un accesso sicuro oppure accedi per prenotare più velocemente e restare vicino alla prossima activation.',
      switchLogin: 'Accedi',
      switchSignup: 'Crea account',
      login: 'Accedi',
      createAccount: 'Crea account',
      helperGuest: 'La prenotazione ospite continua a funzionare. Creare un account rende semplicemente le future prenotazioni più veloci e fluide.',
      password: 'Password *',
      confirmPassword: 'Conferma password *',
      confirmEmailHint: 'Dopo la registrazione, conferma la tua email dal messaggio che ti inviamo prima del primo accesso.',
      optInNote: 'Facoltativo e sempre separato dal tuo login account.',
      loginErrorUnconfirmed: 'Per prima cosa conferma la tua email. Apri l\'email di conferma che ti abbiamo inviato dopo la registrazione, poi torna qui ed effettua l\'accesso.',
      loginSuccess: 'Ora sei connesso.',
      logoutSuccess: 'Ora hai effettuato il logout.',
      loginFailed: 'Accesso non riuscito.',
      signupPasswordMismatch: 'Inserisci la stessa password in entrambi i campi.',
      creatingAccount: 'Creazione account...',
      loggingIn: 'Accesso in corso...',
      accountCreatedAndLoggedIn: 'Account creato e accesso effettuato.',
      accountCreatedConfirm: 'Account creato. Conferma prima la tua email, poi accedi.',
      accountCreatedFor: 'Il tuo account è stato creato per {email}. Conferma la tua email dalla casella di posta prima di provare ad accedere.',
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
      guestBanner: 'Vuoi prenotare più velocemente la prossima volta?',
      guestBannerCta: 'Crea un account oppure accedi',
      guestBannerSuffix: '.',
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
      cancel: 'Annulla',
      completeRequired: 'Compila tutti i campi obbligatori.',
      saving: 'Salvataggio...',
      savedEmailSent: 'Registrazione salvata ed email di conferma inviata.',
      savedEmailPending: 'Registrazione salvata. L\'email di conferma non è ancora stata inviata.',
      failed: 'Registrazione non riuscita.',
      register: 'Registrati',
      full: 'Completo',
      spotsLeft: 'posti disponibili'
    }
  },
  en: {
    meta: {
      title: 'Fitness Truck | The Gym That Moves',
      description: 'Premium outdoor training in Ticino. Small groups, expert coaching, exceptional locations, and sessions designed to move the right people to book fast.'
    },
    nav: {
      events: 'Events',
      experience: 'Experience',
      team: 'Team',
      contact: 'Contact',
      account: 'Account',
      myAccount: 'My Account',
      openAccount: 'Open account',
      openAccountFor: 'Open account for {name}'
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
      badge: 'Outdoor training in Ticino',
      subtitle: 'Premium outdoor training in Ticino’s most striking locations. Small groups, expert coaching, and sessions designed to challenge, energise, and inspire.',
      statStops: 'Ticino stops',
      statSpots: 'Spots/session',
      statEvents: 'Events/year',
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
      accountCardDesc: 'Book faster, save your details once, and stay close to the next activation in Ticino.',
      fasterBookings: 'Faster future bookings',
      newsOptIn: 'Optional event news opt-in',
      guestBooking: 'Guest booking still available'
    },
    events: {
      sectionEyebrow: 'Upcoming events',
      sectionTitleHtml: 'Secure your <span class="text-accent">spot</span>',
      sectionDesc: 'Limited-capacity outdoor sessions in Ticino. Book early to train in exceptional places with expert coaching and a group atmosphere that feels rare from the first minute.',
      emptyTitle: 'No upcoming events',
      emptyDesc: 'The next activation is taking shape now. Create your account to be ready the moment new dates open.',
      emptyCta: 'Create account',
      calendarTitle: 'Upcoming calendar',
      soldOut: 'Sold out',
      almostFull: 'Almost full',
      open: 'Open',
      limited: 'Limited'
    },
    experience: {
      eyebrow: 'The experience',
      titleHtml: 'How it <span class="text-accent">works</span>',
      desc: 'From account to activation, the process is simple, fast, and designed to keep the experience feeling premium.',
      step1Title: 'Choose your session',
      step1Desc: 'Browse the upcoming calendar and pick the event that fits your energy, your schedule, and the kind of location you want to train in.',
      step2Title: 'Reserve your spot',
      step2Desc: 'Places stay intentionally limited. Book in a few clicks and receive everything you need before the event begins.',
      step3Title: 'Train outdoors',
      step3Desc: 'Show up ready. We bring the truck, the coaching, the equipment, and the atmosphere that turns training into something you remember.'
    },
    expect: {
      eyebrow: 'What to expect',
      titleHtml: 'More than a <span class="text-accent">workout</span>',
      desc: 'Every activation blends performance, atmosphere, and unforgettable places across Ticino.',
      feature1: 'Functional performance',
      feature2: 'Mobility & recovery',
      feature3: 'Strength training',
      feature4: 'Endurance',
      feature5: 'Expert coaching',
      feature6: 'Premium equipment',
      photo1: 'Dynamic workouts',
      photo2: 'Expert coaching',
      photo3: 'Stunning locations',
      card1Title: 'Built for real energy',
      card1Desc: 'Expect sessions that blend strength, conditioning, movement quality, and focused coaching. Challenging enough to push you, accessible enough to keep you coming back.',
      card2Title: 'Designed to stay with you',
      card2Desc: 'You are not just joining a workout. You are stepping into a premium outdoor training experience shaped by place, people, and energy.'
    },
    team: {
      eyebrow: 'The team',
      titleHtml: 'Coaching with <span class="text-accent">vision</span>',
      desc: 'A project shaped by performance, care, and the belief that training should feel powerful, human, and unforgettable.',
      nicolasBio: 'Shapes the Fitness Truck concept and experience, turning training into something people feel long after the session ends.',
      nazarenoBio: 'Brings structure, intensity, and coaching depth to every activation, helping people move better and train with purpose.',
      lorenzoBio: 'Supports recovery, resilience, and long-term physical wellbeing, adding a deeper level of care to the experience.'
    },
    contact: {
      eyebrow: 'Contact',
      titleHtml: 'Let’s <span class="text-accent">connect</span>',
      desc: 'Questions, collaborations, or private event ideas? We would love to hear from you.',
      email: 'Email',
      phone: 'Phone',
      instagram: 'Instagram',
      locations: 'Locations',
      locationsValue: 'Ticino first · ready to move beyond it',
      formName: 'Your name',
      formEmail: 'Your email',
      formMessage: 'Your message',
      formNamePlaceholder: 'John Doe',
      formEmailPlaceholder: 'john@example.com',
      formMessagePlaceholder: 'Tell us what you are looking for, and we will come back to you.',
      send: 'Send message',
      sending: 'Sending...'
    },
    footer: {
      tagline: 'Premium outdoor training, born in Ticino.',
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
      accountIntro: 'Create a secure login or sign in to book faster and stay close to the next activation.',
      switchLogin: 'Log in',
      switchSignup: 'Create account',
      login: 'Log in',
      createAccount: 'Create account',
      helperGuest: 'Guest booking still works. Creating an account simply makes future booking faster and smoother.',
      password: 'Password *',
      confirmPassword: 'Confirm password *',
      confirmEmailHint: 'After signup, confirm your email from the message we send you before your first login.',
      optInNote: 'Optional and always separate from your account login.',
      loginErrorUnconfirmed: 'Please confirm your email first. Open the confirmation email we sent after signup, then come back and log in.',
      loginSuccess: 'You are now logged in.',
      logoutSuccess: 'You are now logged out.',
      loginFailed: 'Login failed.',
      signupPasswordMismatch: 'Please re-enter the same password in both fields.',
      creatingAccount: 'Creating account...',
      loggingIn: 'Logging in...',
      accountCreatedAndLoggedIn: 'Account created and you are now logged in.',
      accountCreatedConfirm: 'Account created. Confirm your email first, then log in.',
      accountCreatedFor: 'Your account was created for {email}. Please confirm your email from your inbox before you try to log in.',
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
      guestBanner: 'Want faster booking next time?',
      guestBannerCta: 'Create an account or log in',
      guestBannerSuffix: '.',
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
      cancel: 'Cancel',
      completeRequired: 'Please complete all required fields.',
      saving: 'Saving...',
      savedEmailSent: 'Registration saved and confirmation email sent.',
      savedEmailPending: 'Registration saved. Confirmation email could not be sent yet.',
      failed: 'Registration failed.',
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
        ${item.event_id ? `<button type="button" class="btn btn-secondary btn-inline" data-open-booking-event-id="${escapeAttr(item.event_id)}">${escapeHtml(t('account.openEvent'))}</button>` : ''}
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

  const nextEvent = getUpcomingEvents()[0] || null;
  if (!nextEvent || !Array.isArray(nextEvent.sessions)) {
    renderSignedInHeroFallback(mount);
    return;
  }

  const totalSpots = nextEvent.sessions.reduce((sum, session) => sum + Number(session.maxParticipants || 0), 0);
  const totalRegistered = nextEvent.sessions.reduce((sum, session) => sum + Number(session.registered || 0), 0);
  const remainingSpots = Math.max(totalSpots - totalRegistered, 0);
  const nextEventPhotoUrl = getEventPhotoUrl(nextEvent);
  const sessionsCopy = nextEvent.sessions.length === 1
    ? t('hero.availableSession', { count: nextEvent.sessions.length })
    : t('hero.availableSessions', { count: nextEvent.sessions.length });

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
}

function initAuth() {
  if (!state.user) {
    state.authView = getRequestedAuthView();
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
      basePriceChf: event.base_price_chf || 0,
      photoUrl: event.photo_url || '',
      photoPath: event.photo_path || '',
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
  } finally {
    state.eventsLoaded = true;
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
        <div class="event-image ${getEventPhotoUrl(event) ? 'has-photo' : ''}" data-location="${escapeAttr(getEventLocationMarker(event))}">
          ${getEventPhotoUrl(event) ? `<img class="event-image-photo" src="${escapeAttr(getEventPhotoUrl(event))}" alt="${escapeAttr(event.title)}">` : ''}
          ${isSoldOut ? `<span class="event-badge sold-out">${escapeHtml(t('events.soldOut'))}</span>` : fillPercentage > 80 ? `<span class="event-badge">${escapeHtml(t('events.almostFull'))}</span>` : ''}
          ${getEventPhotoUrl(event) ? '' : `<span class="event-image-caption">${escapeHtml(getEventLocationMarker(event))}</span>`}
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
    let statusText = t('events.open');
    if (availableSpots <= 0) {
      statusClass = 'sold-out';
      statusText = t('events.soldOut');
    } else if (availableSpots < 10) {
      statusClass = 'limited';
      statusText = t('events.limited');
    }

    return `
      <div class="calendar-item" tabindex="0" data-event-id="${escapeAttr(event.id)}">
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
  const eventPhotoUrl = getEventPhotoUrl(event);
  return `
    <div class="modal-header">
      ${eventPhotoUrl ? `<div class="modal-event-photo"><img src="${escapeAttr(eventPhotoUrl)}" alt="${escapeAttr(event.title)}"></div>` : ''}
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
              <div class="label">${escapeHtml(isFull ? t('booking.full') : t('booking.spotsLeft'))}</div>
            </div>
            <button class="btn-register" data-session-id="${escapeAttr(session.id)}" ${isFull ? 'disabled' : ''}>${escapeHtml(isFull ? t('booking.full') : t('booking.register'))}</button>
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
    ? `<div class="auth-registration-banner logged-in"><strong>${escapeHtml(t('booking.signedInBanner', { name: getUserDisplayName() }))}</strong><br>${escapeHtml(t('booking.signedInBannerDesc'))}</div>`
    : `<div class="auth-registration-banner">${escapeHtml(t('booking.guestBanner'))} <button type="button" class="auth-inline-btn" id="openAuthFromRegistration">${escapeHtml(t('booking.guestBannerCta'))}</button>${escapeHtml(t('booking.guestBannerSuffix'))}</div>`;

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
          <button type="submit" class="btn btn-primary">${escapeHtml(t('booking.completeRegistration'))}</button>
          <button type="button" class="btn btn-secondary" id="cancelRegistrationBtn">${escapeHtml(t('booking.cancel'))}</button>
        </div>
      </form>
    </div>`;

  document.getElementById('sessionRegistrationForm').addEventListener('submit', submitRegistrationForm);
  populateRegistrationFormFromUser(document.getElementById('sessionRegistrationForm'));

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
    showToast(t('booking.completeRequired'), 'error');
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = t('booking.saving');

  try {
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
    submitButton.textContent = t('booking.completeRegistration');
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
  initModal();
  initForms();
  initAuth();

  if (isAccountPage()) {
    rerenderLanguageUI();
    return;
  }

  await loadEvents();
});
