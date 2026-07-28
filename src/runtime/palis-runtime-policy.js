const LOOPBACK_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
]);

export const isLoopbackHostname = (hostname) =>
  LOOPBACK_HOSTNAMES.has(String(hostname ?? '').trim().toLowerCase());

export const shouldEnableLocalAdmin = ({
  dev = false,
  explicit = false,
  hostname = '',
} = {}) => Boolean(dev && explicit && isLoopbackHostname(hostname));
