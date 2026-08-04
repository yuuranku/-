import {
  isLoopbackHostname,
  shouldEnableLocalAdmin,
} from './palis-runtime-policy.js';
import { initializeAccessGate, replayAccessTransition } from '../auth.js';
import { createArchiveWorkflowClient } from '../archive-workflow/client.js';

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
    const localRuntime = await createLocalAdminRuntime();
    const replayTransition = new URLSearchParams(window.location.search)
      .has('replay-transition');

    if (replayTransition) {
      // Deliberately limited to Vite's local administrator path above: this is
      // a visual preview, not a route that can grant or alter access online.
      window.requestAnimationFrame(() => {
        void replayAccessTransition({ reducedMotion });
      });
    }

    return localRuntime;
  }

  // The public entry point must never depend on a second round of dynamic
  // module requests before the boot screen can advance.  Cloud deployments
  // can briefly serve the HTML and entry chunk before a freshly emitted
  // dynamic chunk reaches the same edge, which left the terminal frozen at
  // "INITIALIZING SYSTEM BUS".  Authentication is part of the normal online
  // startup path, so keep it in the initial module graph.  The local-only
  // administrator runtime above remains lazy and cannot ship to production.
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
