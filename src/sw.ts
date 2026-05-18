import { precacheAndRoute, addPlugins } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

self.skipWaiting();
clientsClaim();

// A custom plugin that injects the COOP/COEP headers into all responses
const coopCoepPlugin = {
  // Intercept cached responses
  cachedResponseWillBeUsed: async ({ cachedResponse }: { cachedResponse?: Response }) => {
    if (cachedResponse) {
      const newHeaders = new Headers(cachedResponse.headers);
      newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
      newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
      newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: newHeaders,
      });
    }
    return cachedResponse;
  },
  // Intercept network responses
  fetchDidSucceed: async ({ response }: { response: Response }) => {
    if (response.status === 0) return response;
    
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }
};

// Apply the plugin to precached assets
addPlugins([coopCoepPlugin]);

const entries = self.__WB_MANIFEST || [];
precacheAndRoute(entries);

// Apply the plugin to runtime caching
registerRoute(
  () => true,
  new NetworkFirst({
    plugins: [coopCoepPlugin]
  })
);
