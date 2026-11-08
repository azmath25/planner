import { createAuthClient } from '@neondatabase/auth';
import { BetterAuthReactAdapter } from '@neondatabase/auth/react/adapters';

// Explicit staging opt-in prevents a preview from silently authenticating users
// against production. These public service URLs never contain credentials.
const TARGET = import.meta.env.VITE_DAYFRAME_TARGET;
const PROD_AUTH = 'https://ep-blue-salad-b9534bb3.neonauth.c-7.eu-central-1.aws.neon.tech/dayframe/auth';
const STAGING_AUTH = 'https://ep-wispy-surf-b94f834t.neonauth.c-7.eu-central-1.aws.neon.tech/dayframe/auth';
const configured = import.meta.env.VITE_NEON_AUTH_URL as string | undefined;
if (TARGET === 'staging' && configured && configured !== STAGING_AUTH)
  throw new Error('Dayframe staging Auth origin mismatch');
if (TARGET === 'staging' && !import.meta.env.VITE_DAYFRAME_STAGING_API_URL)
  throw new Error('Dayframe staging API is not configured');
if (TARGET !== undefined && TARGET !== 'staging' && TARGET !== 'production')
  throw new Error('Unknown Dayframe deployment target');
export const AUTH_URL = TARGET === 'staging' ? STAGING_AUTH : (configured || PROD_AUTH);

export const authClient = createAuthClient(AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
});
