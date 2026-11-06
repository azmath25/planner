import { createAuthClient } from '@neondatabase/auth';
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters';

// Public Neon Auth URL. No passwords, tokens or DATABASE_URL are embedded in the site.
export const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL ||
  'https://ep-blue-salad-b9534bb3.neonauth.c-7.eu-central-1.aws.neon.tech/dayframe/auth';

export const authClient = createAuthClient(AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
});
