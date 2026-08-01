import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json; charset=utf-8',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), { status: 405, headers });

  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const authorization = request.headers.get('Authorization') || '';
  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: authData } = await callerClient.auth.getUser();
  const callerId = authData.user?.id;
  if (!callerId) return new Response(JSON.stringify({ error: 'UNAUTHENTICATED' }), { status: 401, headers });

  const { data: profile } = await adminClient.from('profiles').select('role,enabled,email').eq('id', callerId).single();
  const administratorEmail = '717652849@qq.com';
  if (!profile?.enabled || profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'ADMIN_REQUIRED' }), { status: 403, headers });
  }

  const payload = await request.json().catch(() => ({}));
  const email = String(payload.email || '').trim().toLowerCase();
  const displayName = String(payload.displayName || '').trim();
  const role = String(payload.role || '').trim();
  if (!email || (role !== 'clerk' && role !== 'observer')) {
    return new Response(JSON.stringify({ error: 'INVALID_INVITE' }), { status: 400, headers });
  }
  if (email === administratorEmail) {
    return new Response(JSON.stringify({ error: 'ADMIN_ALREADY_EXISTS' }), { status: 409, headers });
  }

  const { data: invitation, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName, role },
  });
  if (error || !invitation.user) {
    return new Response(JSON.stringify({ error: error?.message || 'INVITE_FAILED' }), { status: 400, headers });
  }

  await adminClient.from('user_invites').insert({
    email,
    display_name: displayName,
    role,
    status: 'pending',
    invited_by: callerId,
    invited_user_id: invitation.user.id,
  });

  return new Response(JSON.stringify({ userId: invitation.user.id, status: 'invited' }), { status: 200, headers });
});
