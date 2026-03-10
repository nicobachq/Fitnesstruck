# Fitness Truck Website

Deploy this folder directly to Netlify.

## Included
- One-page public site
- Admin dashboard
- Events + sessions model
- Demo registration with per-browser local storage
- Netlify-ready newsletter and contact forms

## Important
This build is ready for **demo deployment**.

It is **not yet a real shared booking backend**. In demo mode:
- registrations are stored only in the visitor's browser
- participant limits are not shared across devices
- admin login is only a front-end demo gate

For production, connect Supabase, Firebase, or serverless functions.

## Deploy
1. Upload the whole folder to Netlify.
2. Add your real `assets/logo.png` and `assets/hero.jpg` if you want to replace the included placeholders.
3. Netlify Forms will capture:
   - newsletter
   - contact

## Admin login
Demo password: `fitnesstruck2026`

Change that before showing the admin page to others.

## Files
- `index.html`
- `styles.css`
- `app.js`
- `admin.html`
- `admin.js`
- `thank-you.html`
- `data/events.json`
- `netlify.toml`
- `assets/logo.png`
- `assets/hero.jpg`


## Confirmation emails
This version includes a Netlify Function at `netlify/functions/send-registration-email.js`.

To enable confirmation emails:
1. Create a Resend account and verify your sending domain in Resend.
2. In Netlify, go to Site configuration → Environment variables.
3. Add these variables with Functions scope:
   - `RESEND_API_KEY` = your Resend API key
   - `RESEND_FROM_EMAIL` = `Fitness Truck <info@fitnesstruck.ch>`
   - `REGISTRATION_REPLY_TO` = `fitnesstruck@proton.me` (optional)
4. Redeploy the site.

If those variables are missing, registrations will still save in Supabase but the confirmation email will not send.
