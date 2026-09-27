# TurfOS real invoice email setup

TurfOS now includes a Cloudflare Pages Function at `/api/send-invoice` that sends invoices through Resend.

## 1. Create a Resend account
Create an account at Resend and create an API key. For production sending from your own address/domain, verify the sending domain in Resend.

## 2. Add secrets to Cloudflare Pages
In Cloudflare: **Workers & Pages → your TurfOS project → Settings → Variables and Secrets**.

Add:

- `RESEND_API_KEY` — your Resend API key. Save this as an encrypted secret.
- `INVOICE_FROM_EMAIL` — the verified sender, for example `TurfOS Billing <billing@yourdomain.com>`.

Then redeploy the site so the Function receives those values.

## 3. Add your business email inside TurfOS
TurfOS is preconfigured to use **turfos.business@gmail.com** as the business/customer reply-to address. Customers who reply to an invoice will reply to this Gmail account. You can still change it in **Settings → Invoice delivery** if needed.

Leave **Automatic invoice email endpoint** as `/api/send-invoice`.

## 4. Test
Add your own email as a test customer, create an invoice, and press **Send**. The invoice should show **Sent** and your inbox should receive the message.

## Security
Do not put the Resend API key into `../pages/app.html` or any browser JavaScript. The included Cloudflare Function keeps the key on the server.


> Note: the Gmail account connected to ChatGPT cannot be used directly by the deployed website. Automatic delivery still uses the secure server email provider configured above; `turfos.business@gmail.com` is the customer-facing reply-to address.
