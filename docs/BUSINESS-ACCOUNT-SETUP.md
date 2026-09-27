# TurfOS business accounts — Cloudflare setup

TurfOS now has real company signup/login backed by Cloudflare KV.

## One-time Cloudflare setup

1. Open your TurfOS project in **Cloudflare → Workers & Pages**.
2. Open **Settings → Bindings**.
3. Click **Add** and choose **KV namespace**.
4. Create or select a KV namespace for TurfOS accounts (for example `turfos-accounts`).
5. Set the binding / variable name **exactly** to:

   `TURFOS_ACCOUNTS`

6. Save the binding.
7. Create a **new Production deployment** using the ZIP in this package.

Your existing invoice secrets remain unchanged:

- `RESEND_API_KEY`
- `INVOICE_FROM_EMAIL`

## How signup works

Open `../pages/business.html` on your hosted TurfOS site. New companies can choose **Create account** and enter:

- company name
- owner / manager name
- business email
- phone
- service area
- password (8+ characters)

After signup, TurfOS uses the company name throughout the business workspace and invoices. The business profile is stored in Cloudflare KV and can be edited in **Settings → Business account**.

Passwords are not stored as plain text. TurfOS stores a PBKDF2-SHA256 password hash with a unique salt. Login sessions expire after 30 days.

## Current data-sync scope

The **account and company profile** work across devices because they are stored in Cloudflare KV.

Property maps, mowing history, routes, customers, photos, and invoices are still stored in that browser's TurfOS workspace in this version. They are separated by business account on a shared device, but full cross-device business-data sync is the next backend step.
