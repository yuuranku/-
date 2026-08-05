import { createClient } from 'npm:@supabase/supabase-js@2';

const ADMINISTRATOR_EMAIL = '717652849@qq.com';
const ALLOWED_ROLES = new Set(['clerk', 'observer']);
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
  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData } = await callerClient.auth.getUser();
  const callerId = authData.user?.id;
  if (!callerId) return respond({ error: 'UNAUTHENTICATED' }, 401);
  const { data: caller } = await adminClient
    .from('profiles')
    .select('role,enabled,email')
    .eq('id', callerId)
    .single();
  if (
    !caller?.enabled
    || caller.role !== 'admin'
    || String(caller.email).toLowerCase() !== ADMINISTRATOR_EMAIL
  ) return respond({ error: 'ADMIN_REQUIRED' }, 403);

  const payload = await request.json().catch(() => ({}));
  const action = String(payload.action || '').trim();
  const userId = String(payload.userId || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const displayName = String(payload.displayName || '').trim();
  const role = String(payload.role || '').trim();
  const password = String(payload.password || '');

  if (action === 'list') {
    const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }] =
      await Promise.all([
        adminClient.auth.admin.listUsers({ page: 1, perPage: 200 }),
        adminClient.from('profiles').select('id,email,display_name,role,enabled,clerk_rank,created_at,updated_at'),
      ]);
    if (authError || profileError) {
      return respond({ error: authError?.message || profileError?.message || 'LIST_FAILED' }, 400);
    }
    const authById = new Map((authUsers.users || []).map((user) => [user.id, user]));
    const users = (profiles || []).map((profile) => {
      const authUser = authById.get(profile.id);
      return {
        ...profile,
        protected: String(profile.email).toLowerCase() === ADMINISTRATOR_EMAIL,
        last_sign_in_at: authUser?.last_sign_in_at || null,
        password_status: '已设置（不可查看）',
      };
    });
    return respond({ users });
  }

  if (action === 'create') {
    if (!email || !displayName || !ALLOWED_ROLES.has(role) || password.length < 8) {
      return respond({ error: 'INVALID_ACCOUNT' }, 400);
    }
    if (email === ADMINISTRATOR_EMAIL) return respond({ error: 'ADMIN_ALREADY_EXISTS' }, 409);
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, role },
    });
    if (error || !data.user) return respond({ error: error?.message || 'CREATE_FAILED' }, 400);
    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: data.user.id,
      email,
      display_name: displayName,
      role,
      enabled: true,
    });
    if (profileError) {
      await adminClient.auth.admin.deleteUser(data.user.id);
      return respond({ error: profileError.message }, 400);
    }
    return respond({ userId: data.user.id, status: 'created' });
  }

  if (!userId) return respond({ error: 'USER_REQUIRED' }, 400);
  const { data: target } = await adminClient
    .from('profiles')
    .select('id,email,role,enabled')
    .eq('id', userId)
    .single();
  if (!target) return respond({ error: 'USER_NOT_FOUND' }, 404);
  const protectedAccount = String(target.email).toLowerCase() === ADMINISTRATOR_EMAIL;

  if (action === 'update-role') {
    if (protectedAccount || !ALLOWED_ROLES.has(role)) {
      return respond({ error: 'PROTECTED_OR_INVALID_ROLE' }, 400);
    }
    const { error } = await adminClient
      .from('profiles')
      .update({ role, enabled: true })
      .eq('id', userId);
    if (error) return respond({ error: error.message }, 400);
    await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
      user_metadata: { role },
    });
    return respond({ userId, status: 'updated', role });
  }

  if (action === 'update-clerk-rank') {
    const clerkRank = Number(payload.clerkRank);
    if (protectedAccount || target.role !== 'clerk' || !Number.isInteger(clerkRank) || clerkRank < 1 || clerkRank > 7) {
      return respond({ error: 'PROTECTED_OR_INVALID_CLERK_RANK' }, 400);
    }
    const { error } = await adminClient
      .from('profiles')
      .update({ clerk_rank: clerkRank })
      .eq('id', userId);
    if (error) return respond({ error: error.message }, 400);
    return respond({ userId, status: 'updated', clerk_rank: clerkRank });
  }

  if (action === 'reset-password') {
    if (password.length < 8) return respond({ error: 'PASSWORD_TOO_SHORT' }, 400);
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (error) return respond({ error: error.message }, 400);
    return respond({ userId, status: 'password-reset' });
  }

  if (action === 'delete') {
    if (protectedAccount) return respond({ error: 'PROTECTED_ADMINISTRATOR' }, 400);
    const [{ count: contributions }, { count: versions }, { count: reviews }] = await Promise.all([
      adminClient.from('archive_contributions').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
      adminClient.from('archive_versions').select('id', { count: 'exact', head: true })
        .or(`submitter_id.eq.${userId},modifier_id.eq.${userId},reviewer_id.eq.${userId}`),
      adminClient.from('archive_reviews').select('id', { count: 'exact', head: true }).eq('reviewer_id', userId),
    ]);
    const hasHistory = Number(contributions || 0) + Number(versions || 0) + Number(reviews || 0) > 0;
    if (hasHistory) {
      await adminClient.from('profiles').update({ enabled: false }).eq('id', userId);
      await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
      return respond({ userId, status: 'disabled', historyPreserved: true });
    }
    await adminClient.from('user_invites').delete().eq('invited_user_id', userId);
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) return respond({ error: error.message }, 400);
    return respond({ userId, status: 'deleted', historyPreserved: false });
  }

  return respond({ error: 'UNKNOWN_ACTION' }, 400);
});
