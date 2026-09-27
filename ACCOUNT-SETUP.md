# TurfOS Business + Customer Accounts

## Public entry
The root website presents only two options:
- Business — owners, managers, and crew log in here. Business owners can also create an account.
- Customer — customers can log in or create an account.

The Homeowner mode has been removed.

## Business accounts
Business signup asks for company name, owner/manager, email, phone, service area, and password.

After login, go to **Settings → Business account** to find the company's **Company Code** (for example `TURF-12AB34CD`). Give this code to customers who need to create their portal account.

## Customer accounts
Customer signup asks for:
- Company Code
- Name
- Email
- Phone
- Service address
- Billing address (optional)
- Service notes (optional)
- Password

If the business already has a customer record with the same email, signup claims that existing record. Otherwise TurfOS creates a new customer/property in that business workspace.

Customer login uses Company Code + email + password.

## Cloudflare requirement
Keep the existing KV binding named exactly:

`TURFOS_ACCOUNTS`

Upload the ZIP as a new Production deployment to the same Cloudflare Pages project. Existing `RESEND_API_KEY` and `INVOICE_FROM_EMAIL` settings can remain unchanged.
