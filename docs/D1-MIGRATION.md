# TurfOS D1 migration

This build makes **Cloudflare D1 the primary storage for TurfOS**.

## Required Cloudflare bindings

Keep both bindings during the transition:

- `db` — your Cloudflare D1 database. This is now the primary application store.
- `TURFOS_ACCOUNTS` — your old Workers KV namespace. Keep it temporarily so the one-time migration can copy existing records.

Normal business accounts, customer accounts, sessions, workspaces, customer records, invoices/messages stored in the workspace, and crew account data now go through D1. The old KV binding is only used by the migration endpoint.

## Deploy and migrate

1. Confirm the D1 binding is named exactly `db` on the Production deployment.
2. Leave `TURFOS_ACCOUNTS` attached for now.
3. Deploy this ZIP to the same Cloudflare Pages project.
4. On the same browser where you were already signed in as the existing TurfOS owner, open:
   `https://business.turfoperatingsystem.com/pages/d1-migrate.html`
5. Click **Move existing data to D1**.
6. Wait for the page to say **Migration complete**.
7. Open TurfOS and test:
   - business login
   - Customers & Properties
   - customer signup link
   - customer login
   - invoices/messages
   - another device/browser
8. Visit `/api/auth-health`. It should show `primaryStorage: D1` and `d1: ready`.

If owner-session authorization does not work, create a Cloudflare secret named `D1_MIGRATION_SECRET`, enter its value only on the migration page, and retry. Do not send that secret through chat or email.

## If migration stops because KV is at its daily limit

The migration is resumable. It skips keys already copied to D1. Upgrade Workers or wait for the KV reset, then run the migration page again.

## When can KV be removed?

Do not remove `TURFOS_ACCOUNTS` immediately. Keep it connected for a short backup window after you verify the migrated data. Normal TurfOS traffic in this build no longer reads or writes KV.

## Architecture note

This is the safest first D1 cutover: it moves the existing TurfOS data model into D1 without simultaneously redesigning every business object. That minimizes the risk of losing or breaking existing customer data. A later phase can split the D1 JSON records into fully normalized tables for customers, properties, jobs, invoices, messages, and schedules.
