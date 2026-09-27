# TurfOS - Cloudflare Pages Direct Upload

This folder is ready for Cloudflare Pages Direct Upload.

## Deploy
1. Sign in to Cloudflare.
2. Open Workers & Pages.
3. Create application -> Pages -> Drag and drop files.
4. Upload the entire contents of this ZIP (or the ZIP itself if Cloudflare accepts it in the uploader).
5. Choose a project name such as `turfos`.
6. Deploy. Your site will get a URL like `https://turfos.pages.dev`.

## Required email settings
After the first deploy, open your Pages project settings and add these variables/secrets:
- RESEND_API_KEY = your Resend API key
- INVOICE_FROM_EMAIL = a verified sender such as `TurfOS Billing <billing@yourdomain.com>`

Then create a new production deployment so the Worker receives the environment variables.

The customer reply-to address in TurfOS defaults to:
`turfos.business@gmail.com`

## Test
Open:
`https://YOUR-PROJECT.pages.dev/api/email-health`

You should receive JSON. `worker` should be true. `apiKey` should be true after RESEND_API_KEY is configured.

Then open TurfOS -> Settings -> Invoice delivery -> Test email setup.

## Important
Use the hosted `https://...pages.dev` site. Invoice email sending cannot work by opening app.html directly from your computer.
