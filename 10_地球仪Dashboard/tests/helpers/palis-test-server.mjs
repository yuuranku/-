import { createServer as createTcpServer } from 'node:net';

import { createServer as createViteServer } from 'vite';

const reserveLoopbackPort = () => new Promise((resolve, reject) => {
  const probe = createTcpServer();
  probe.unref();
  probe.once('error', reject);
  probe.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
    const address = probe.address();
    if (!address || typeof address === 'string') {
      probe.close();
      reject(new Error('Unable to reserve a loopback test port'));
      return;
    }
    probe.close((error) => {
      if (error) reject(error);
      else resolve(address.port);
    });
  });
});

export const startPalisTestServer = async ({ root = process.cwd() } = {}) => {
  const port = await reserveLoopbackPort();
  const server = await createViteServer({
    root,
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
    },
  });
  try {
    await server.listen();
  } catch (error) {
    await server.close();
    throw error;
  }
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('PALIS test server did not expose a TCP address');
  }

  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      if (closed) return;
      closed = true;
      server.httpServer?.closeAllConnections?.();
      await server.close();
    },
  };
};
