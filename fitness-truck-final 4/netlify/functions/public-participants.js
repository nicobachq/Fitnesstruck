const {
  getEnv,
  jsonResponse,
  normalizeEmail,
  supabaseRequest
} = require('./_payment-helpers');

function getSupabaseProjectUrl() {
  return getEnv('SUPABASE_URL').replace(/\/$/, '');
}

function buildAvatarUrl(avatarPath = '', avatarUpdatedAt = '') {
  const normalizedPath = String(avatarPath || '').trim().replace(/^\/+/, '');
  if (!normalizedPath) return '';
  const base = `${getSupabaseProjectUrl()}/storage/v1/object/public/avatars/${normalizedPath}`;
  return avatarUpdatedAt ? `${base}?v=${encodeURIComponent(String(avatarUpdatedAt))}` : base;
}

function getFirstName(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return parts[0] || 'Guest';
}

async function listAllAuthUsers() {
  const baseUrl = getSupabaseProjectUrl();
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const perPage = 1000;
  const users = [];

  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(`${baseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      }
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(json?.msg || json?.message || `Could not load auth users (${response.status}).`);
    }

    const pageUsers = Array.isArray(json?.users) ? json.users : [];
    users.push(...pageUsers);
    if (pageUsers.length < perPage) break;
  }

  return users;
}

async function syncStoredSessionCounts(allSessions, activeRegistrations) {
  const counts = new Map();
  activeRegistrations.forEach((registration) => {
    const sessionId = String(registration?.session_id || '').trim();
    if (!sessionId) return;
    counts.set(sessionId, (counts.get(sessionId) || 0) + 1);
  });

  const updates = allSessions
    .map((session) => ({
      id: String(session?.id || '').trim(),
      storedCount: Number(session?.registered_count || 0),
      liveCount: counts.get(String(session?.id || '').trim()) || 0
    }))
    .filter((item) => item.id && item.storedCount !== item.liveCount);

  await Promise.all(updates.map((item) => supabaseRequest(`/sessions?id=eq.${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    body: { registered_count: item.liveCount }
  }).catch((error) => {
    console.error('Session count sync warning:', item.id, error);
    return null;
  })));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { success: false, message: 'Method not allowed' });
  }

  try {
    const [sessions, registrations, authUsers] = await Promise.all([
      supabaseRequest('/sessions?select=id,registered_count'),
      supabaseRequest('/registrations?select=session_id,full_name,email,attendance_status,created_at&order=created_at.asc'),
      listAllAuthUsers().catch((error) => {
        console.error('Auth user list warning:', error);
        return [];
      })
    ]);

    const activeRegistrations = Array.isArray(registrations)
      ? registrations.filter((row) => String(row?.attendance_status || '').trim().toLowerCase() !== 'cancelled')
      : [];

    await syncStoredSessionCounts(Array.isArray(sessions) ? sessions : [], activeRegistrations);

    const usersByEmail = new Map();
    (Array.isArray(authUsers) ? authUsers : []).forEach((user) => {
      const email = normalizeEmail(user?.email || '');
      if (!email || usersByEmail.has(email)) return;
      usersByEmail.set(email, user);
    });

    const sessionMap = new Map();
    activeRegistrations.forEach((registration) => {
      const sessionId = String(registration?.session_id || '').trim();
      if (!sessionId) return;
      const email = normalizeEmail(registration?.email || '');
      const authUser = usersByEmail.get(email);
      const metadata = authUser?.user_metadata || {};
      const firstName = getFirstName(registration?.full_name || metadata?.full_name || '');
      const avatarUrl = buildAvatarUrl(metadata?.avatar_path || '', metadata?.avatar_updated_at || '');
      const participant = {
        key: email || `${sessionId}:${firstName}`,
        firstName,
        avatarUrl
      };

      const bucket = sessionMap.get(sessionId) || { count: 0, participants: [] };
      bucket.count += 1;
      if (!bucket.participants.some((item) => item.key === participant.key)) {
        bucket.participants.push(participant);
      }
      sessionMap.set(sessionId, bucket);
    });

    const sessionsPayload = {};
    sessionMap.forEach((value, key) => {
      sessionsPayload[key] = {
        count: value.count,
        participants: value.participants.slice(0, 12)
      };
    });

    return jsonResponse(200, {
      success: true,
      sessions: sessionsPayload
    });
  } catch (error) {
    console.error('Public participants error:', error);
    return jsonResponse(500, { success: false, message: error.message || 'Could not load participants.' });
  }
};
