# TurfOS Field App setup

This build turns the hosted TurfOS site into an installable Progressive Web App and adds shared owner/crew workspace sync.

## Cloudflare requirements

Keep the existing Pages project and these existing items:

- `TURFOS_ACCOUNTS` — KV namespace binding. This now stores business accounts, crew accounts and the shared company workspace.
- `RESEND_API_KEY` — secret used for invoice email delivery.
- `INVOICE_FROM_EMAIL` — verified Resend sender address.

No additional Cloudflare binding is required for the field-app beta.

## Deploy

1. Open the TurfOS Cloudflare Pages project.
2. Keep the `TURFOS_ACCOUNTS` KV binding attached to Production.
3. Upload this ZIP as a new Production deployment.
4. Open the new `https://...pages.dev` deployment once.
5. Sign in as the business owner.
6. Open **Settings → Manage crew** and create employee logins.
7. Crew members use the same hosted URL or `../pages/app.html` and sign in with their employee email/password.

## Install on phones

### iPhone / iPad
Open TurfOS in Safari → Share → **Add to Home Screen**.

### Android / Chrome
Open TurfOS → browser menu → **Install app** / **Add to Home screen**. TurfOS will also show an install prompt where supported.

## Cloud workspace behavior

- Owner and crew users share the same company workspace through Cloudflare KV.
- The latest workspace is also cached locally on each device for field startup and weak-signal use.
- Changes sync automatically when online and can be forced with **Sync now**.
- Crew accounts get a simplified Today / Property Map / Schedule / Weather / Mow Log interface.
- Completion photos remain inside the workspace in this beta. For a larger production rollout, move photos to Cloudflare R2 so the workspace does not grow indefinitely.

## Production note

The shared workspace currently uses last-write-wins syncing. This is suitable for demos and small crews, but a larger multi-crew rollout should move jobs/properties/invoices into a transactional database such as Cloudflare D1/Postgres and completion photos into R2.


## Business vs Customer entry
The public homepage now has only two choices: Business and Customer. Owners, managers, and crew members use Business. Crew role is detected after login automatically. Customers use Customer and sign in with their email plus the Customer ID shown in the business Customer record. The Homeowner mode has been removed.
