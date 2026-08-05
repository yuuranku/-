import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json; charset=utf-8',
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authorization = request.headers.get('Authorization') || '';
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: authData } = await callerClient.auth.getUser();
  const callerId = authData.user?.id;
  if (!callerId) return respond({ error: 'UNAUTHENTICATED' }, 401);

  const { data: profile } = await adminClient.from('profiles').select('role,enabled,email').eq('id', callerId).single();
  if (
    !profile?.enabled
    || profile.role !== 'admin'
    || String(profile.email).toLowerCase() !== ADMINISTRATOR_EMAIL
  ) {
    return respond({ error: 'ADMIN_REQUIRED' }, 403);
  }

  const payload = await request.json().catch(() => ({}));
  const email = String(payload.email || '').trim().toLowerCase();
  const displayName = String(payload.displayName || '').trim();
  const role = String(payload.role || '').trim();
  if (!email || !displayName || (role !== 'clerk' && role !== 'observer')) {
    return respond({ error: 'INVALID_INVITE' }, 400);
  }
  if (email === ADMINISTRATOR_EMAIL) {
    return respond({ error: 'ADMIN_ALREADY_EXISTS' }, 409);
  }

  const { data: invitation, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName, role },
  });
  if (error || !invitation.user) {
    return respond({ error: error?.message || 'INVITE_FAILED' }, 400);
  }

  const { error: inviteError } = await adminClient.from('user_invites').insert({
    email,
    display_name: displayName,
    role,
    status: 'pending',
    invited_by: callerId,
    invited_user_id: invitation.user.id,
  });
  if (inviteError) return respond({ error: inviteError.message }, 400);

  return respond({ userId: invitation.user.id, status: 'invited' });
});
