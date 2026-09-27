# TurfOS customer intake links

Each business account now has a unique customer signup link.

## Where the business finds it
1. Sign in to TurfOS as the business owner.
2. Open Settings.
3. Find **Business account**.
4. Under **Customer signup link**, choose **Copy link**.

The link looks like:

`https://YOUR-SITE.pages.dev/pages/customer.html?business=TURF-XXXXXXXX&signup=1`

The business can place this behind a **Request Service**, **Become a Customer**, or **Customer Signup** button on its own website.

## What happens when a customer uses it
- TurfOS reads the business code from the link.
- The customer sees which lawn company they are signing up with.
- The customer enters name, email, phone, service address, billing address, service notes, and password.
- The record is stored in the Cloudflare `TURFOS_ACCOUNTS` KV namespace.
- The customer is also added to that business's shared TurfOS workspace.
- Future customer login uses the same business relationship.

## Storage
Customer data is stored in Cloudflare KV in three ways so it can be recovered and associated with the correct company:
- the customer account record
- a dedicated customer profile record
- the company's shared workspace/customer list

Keep the existing `TURFOS_ACCOUNTS` KV binding. No new Cloudflare binding is required for this update.
