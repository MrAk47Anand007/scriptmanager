// Built-in OAuth client IDs so end users get one-click "Connect account"
// without registering their own app — exactly how commercial desktop apps
// (Postman, Insomnia, rclone, …) ship Google/Microsoft integration.
//
// As the app developer, register ONCE:
//  - Google:    console.cloud.google.com → APIs & Services → Credentials →
//               OAuth client ID → type "Desktop app". Enable the Drive API.
//               Publish the OAuth consent screen (otherwise refresh tokens
//               expire after 7 days in testing mode).
//  - Microsoft: portal.azure.com → App registrations → New → supported
//               account types "Personal + work/school" → Authentication →
//               add platform "Mobile and desktop applications" with the
//               redirect http://127.0.0.1 and enable public client flows.
//
// Then paste the IDs below (or set the env vars at build/run time).
// These are PUBLIC identifiers — installed-app client IDs are not secrets
// (PKCE protects the flow), so committing them is safe and standard.

export const DEFAULT_OAUTH_CLIENT_IDS: Record<'gdrive' | 'onedrive', string> = {
  gdrive: process.env.GDRIVE_CLIENT_ID ?? '',
  onedrive: process.env.ONEDRIVE_CLIENT_ID ?? '',
}

export function getDefaultClientId(provider: 'gdrive' | 'onedrive'): string | null {
  const id = DEFAULT_OAUTH_CLIENT_IDS[provider]?.trim()
  return id ? id : null
}
