import type { ContentProvider } from './types.js';

const providers: Map<string, ContentProvider> = new Map();

export function registerProvider(provider: ContentProvider): void {
  providers.set(provider.name, provider);
  console.log(`Provider registered: ${provider.displayName}`);
}

export function getProvider(name: string): ContentProvider | undefined {
  return providers.get(name);
}

export function getEnabledProviders(): ContentProvider[] {
  return Array.from(providers.values()).filter((p) => p.enabled);
}

export function getAllProviders(): ContentProvider[] {
  return Array.from(providers.values());
}
