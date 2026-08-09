import {
  isLoopbackHostname,
  shouldEnableLocalAdmin,
} from './palis-runtime-policy.js';
import { initializeAccessGate } from '../auth.js';
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
      // Deliberately limited to the loopback-only local administrator runtime:
      // this plays the full boot and mark hand-off without creating a session.
      initializeAccessGate({
        reducedMotion,
        autoPreview: true,
        // main.js normally activates the local runtime immediately.  For this
        // explicit test route, hold it back until the access hand-off has
        // fully finished, otherwise it hides the gate before boot can render.
        onTransitionComplete: () => localRuntime.activate(),
      });
      return {
        ...localRuntime,
        activate() {},
      };
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
