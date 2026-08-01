import {
  isLoopbackHostname,
  shouldEnableLocalAdmin,
} from './palis-runtime-policy.js';

export async function initializePalisRuntime({
  reducedMotion = false,
  dev = import.meta.env.DEV,
  explicit = import.meta.env.VITE_PALIS_LOCAL_ADMIN === '1',
  hostname = window.location.hostname,
} = {}) {
  if (dev && explicit) {
    if (!isLoopbackHostname(hostname)) {
      throw new Error('PALIS local administrator mode is restricted to this computer.');
    }
    const { createLocalAdminRuntime } = await import(
      '../archive-workflow/local/local-admin-runtime.js'
    );
    return createLocalAdminRuntime();
  }

  const [{ initializeAccessGate }, { createArchiveWorkflowClient }] = await Promise.all([
    import('../auth.js'),
    import('../archive-workflow/client.js'),
  ]);
  const accessContext = initializeAccessGate({ reducedMotion });

  return {
    repository: accessContext?.supabase
      ? createArchiveWorkflowClient(accessContext.supabase)
      : null,
    initialSession: null,
    activate() {},
  };
}

export { shouldEnableLocalAdmin };
