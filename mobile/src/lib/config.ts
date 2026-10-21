/* The publishable key is meant to be public (row level security keeps each user's data private).
   Never put a secret/service key in this repo. */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://zdllpjrkwcdmcuizxuum.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_MDB4dT4ybWlZk5rzdcx40w_G7KwYRtm';

/** Where email confirmation and password-reset links land (the web app handles them). */
export const WEB_URL = 'https://do-mict.github.io/workout-tracker/';

export const APP_VERSION = '2026.10.21-mobile';
