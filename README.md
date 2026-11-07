# Perfectly

> **Project root:** All application files are located directly in this directory: `package.json`, `index.html`, `src/`, `api/`, and `server/`. When importing this repository into Vercel, leave **Root Directory** empty or set it to the repository root (`./`). Do not select the old nested directory `perfectly-work/perfectly`.

Perfectly is an AI coding workspace starter built with **React + Vite**, based on the supplied HTML reference and app icon.

## Features

- Responsive, mobile-first landing page with subtle animations and a monochrome interface.
- Dark mode is the default theme. A Dark/Light toggle is available on the landing page, login, sign-up, and workspace. The selected theme is saved in the browser and restored on future visits.
- Email/password authentication, Google OAuth, and GitHub OAuth.
- Authentication, accounts, sessions, and chat history are stored in **Neon PostgreSQL**.
- Email passwords are hashed with `scrypt`. Session tokens are stored as SHA-256 hashes and delivered through `HttpOnly` cookies.
- Dynamic chat workspace at `/chat/{25-character-random-id}` with Markdown and GitHub Flavored Markdown support for user and assistant messages, loading indicators, cross-device history, logout, and model selection. `/app` automatically opens a new chat.
- PNG/JPG/WEBP/GIF image uploads and text/code files including TXT, MD, JSON, CSV, JS/TS, HTML, CSS, Python, Java, Go, Rust, SQL, LOG, YAML, XML, and SH.
- Vercel serverless backend endpoints at `/api/auth`, `/api/auth/callback/*`, `/api/chat`, `/api/chats`, and `/api/health`.
- Ollama Cloud integration for Beam and Gemma 4, OpenAI API integration for GPT, and Anthropic API integration for Claude. Beam is the default model.
- Database credentials and AI API keys are only read by the backend. No secrets are exposed to the browser.

## Appearance and theme

Perfectly starts in **dark mode** by default. Use the sun/moon icon at the top of the page to switch to light mode or return to dark mode. The selection is stored in `localStorage` under the `perfectly.theme` key, so it remains consistent across the landing page, login, sign-up, and workspace in the same browser. Beam is selected by default. The composer expands as the prompt grows; press `Enter` to send and `Shift+Enter` to insert a new line.

## Chat routes and composer

Each new chat uses the `/chat/{id}` URL. The ID contains exactly **25 alphanumeric characters** and is generated randomly in the browser when a prompt is submitted. Example: `/chat/Ab3dEf7GhJkLmN2pQr5StUvWx`. Neon retains its internal UUID and uses a unique `public_id` column for the URL, so existing conversation primary keys do not need to change.

The composer stays compact like a modern chat input and grows with the text up to a comfortable limit. `Enter` sends a message, while `Shift+Enter` adds a line break. The attachment button accepts image and text/code files, including images pasted from the clipboard. Markdown and GitHub Flavored Markdown are rendered in both user and assistant bubbles. **Beam** is the default model and can be changed using the selector beside the send button. The Cowork button is a preview only; it does not run a desktop agent.

## 1. Installation and development

```bash
npm install
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local`.

Run the Vite frontend only:

```bash
npm run dev
```

Run the frontend with Vercel serverless API functions:

```bash
npm run dev:vercel
```

Build the frontend:

```bash
npm run build
```

Use `npm run dev:vercel` to test login, chat history, and local API endpoints. The standard Vite dev server does not execute functions in the `api/` directory.

## 2. Configure Neon PostgreSQL

1. Create a project in the [Neon Console](https://console.neon.tech/).
2. Select the database and role that the application will use.
3. Click **Connect**, select the branch/database/role, and copy the connection string. For Vercel, use a pooled connection string when available.
4. Set the connection string as `DATABASE_URL` in `.env.local` and in Vercel → Project → Settings → Environment Variables.
5. Do not add a `VITE_` prefix to `DATABASE_URL`, and never commit `.env.local`.

Example format (not a real credential):

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

Tables are created automatically when an API endpoint is called for the first time. To create them manually, open the Neon SQL Editor and run `neon-schema.sql` from the project root. The schema creates:

- `perfectly_users` — email accounts, password hashes, and profiles.
- `perfectly_oauth_accounts` — Google/GitHub identities linked to accounts.
- `perfectly_sessions` — login sessions with a 30-day lifetime.
- `perfectly_conversations` — chat history stored as JSONB and linked to its owner. The `public_id` column stores the 25-character alphanumeric URL ID; the internal UUID remains the primary key.

Chat history is scoped by `user_id`, so one account cannot access another account's conversations through the API.

## 3. Email/password authentication

No external authentication service is required. The backend handles registration and login. Passwords must be 8–128 characters long and are hashed with Node.js `scrypt`. Random session tokens are stored as hashes in Neon. The browser only receives an `HttpOnly`, `SameSite=Lax` cookie with the `Secure` flag enabled over HTTPS.

**Note:** This version does not send email verification or password-reset emails. For a public production launch, add an email delivery service for email verification and password recovery before opening registration widely.

## 4. Google OAuth

1. Create an OAuth Client ID with the **Web application** type in the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add the following exact Authorized redirect URIs:
   - `https://YOUR-DOMAIN/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` for optional local testing.
3. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local` and the Vercel environment variables.
4. The application requests these scopes: `openid email profile`.

Google requires the redirect URI to match the registered value exactly. Update the domain if you use a custom domain.

## 5. GitHub OAuth

1. Open GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Set the Homepage URL to your application domain.
3. Set the Authorization callback URL to one of these exact URLs:
   - `https://YOUR-DOMAIN/api/auth/callback/github`
   - `http://localhost:3000/api/auth/callback/github` for optional local testing.
4. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.env.local` and Vercel.
5. The application requests the `read:user` and `user:email` scopes. The GitHub account must have a verified email address.

Never put Google/GitHub client secrets in a `VITE_` variable or frontend source code.

## 6. APP_URL and callbacks

Set `APP_URL` to the final origin, without a trailing slash. For example:

```env
APP_URL=https://YOUR-DOMAIN
```

For Vercel deployments, explicitly set this variable so OAuth callbacks always use the correct domain. For local development with `vercel dev`, use `http://localhost:3000`.

## 7. Configure AI API keys

Add API keys as server-side environment variables:

| Model in UI | Provider | Default model ID | Environment variable |
|---|---|---|---|
| Beam | Ollama Cloud | `beam` | `OLLAMA_API_KEY` |
| Gemma 4 | Ollama Cloud | `gemma4:31b` | `OLLAMA_API_KEY` |
| GPT 6 Luna | OpenAI | `gpt-6-luna` | `OPENAI_API_KEY` |
| GPT 6 Astra | OpenAI | `gpt-6-astra` | `OPENAI_API_KEY` |
| Claude Sonnet 5.5 | Anthropic | `claude-sonnet-5-5` | `ANTHROPIC_API_KEY` |
| Claude Opus 5.5 | Anthropic | `claude-opus-5-5` | `ANTHROPIC_API_KEY` |

- **Ollama Cloud:** the backend calls `https://ollama.com/api/chat`.
- **OpenAI:** the backend uses `https://api.openai.com/v1/responses`.
- **Anthropic:** the backend uses `https://api.anthropic.com/v1/messages`.

A ChatGPT subscription is not an OpenAI Platform API key. A Claude Pro/Max subscription is also not an Anthropic API key; API usage is managed and billed separately.

Model IDs can be customized using the optional overrides in `.env.example`.

## 8. Deploy to Vercel

1. Push the contents of this project folder (not its parent folder) to the root of a GitHub repository, or import the repository into Vercel.
2. In Vercel → Settings → Build and Deployment, set **Root Directory** to the repository root (`./` or leave it empty).
3. Set the Framework Preset to **Vite**. `vercel.json` configures `npm run build`, `npm install`, and the `dist` output directory.
4. Make sure `api/`, `server/`, `src/`, and `public/`, along with `package.json`, `index.html`, and `vercel.json`, are all located directly in the project root.
5. Add these environment variables:
   - `DATABASE_URL`
   - `APP_URL`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - `OLLAMA_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
   - Optional model ID overrides, if needed.
6. Make sure the Google and GitHub callback URLs use the same deployment domain as `APP_URL`.
7. Deploy or redeploy after adding the environment variables.

Vercel runs serverless functions from the `api/` directory. `vercel.json` configures the Vite build, `dist` output, function duration, and fallback only for SPA routes (`/chat/*`, `/login`, `/signup`, `/app`, and `/auth/callback`). The SPA fallback does not rewrite `/api/*` endpoints.

## 9. Database health check

Open `/api/health` on the deployed site. The response shows the Neon connection status, AI provider configuration status, and the model list. It never returns the database connection string or API key values.

## Current limitations

- Email verification, password reset, MFA, and dedicated login rate limiting are not included. Add these protections before opening the service to a large public audience.
- Chat history is stored in Neon and can be loaded across browsers/devices after login.
- Image attachments are sent to the AI provider during the request. The database history stores attachment names and MIME types, not image binaries.
- Cowork is a preview button and does not run a desktop agent. PDF parsing, repository import, shell/terminal access, Git operations, and automatic file editing are not available. The assistant must not be assumed to have executed commands or modified a repository.
- Free/Pro status is stored in `perfectly_users.is_pro`. Pro access is currently granted manually through the Neon SQL Editor; no payment gateway is implemented.
- Images are limited to 1.5 MB per file and 1.5 MB total per message. Accepted formats: PNG, JPG, WEBP, GIF. Text/code files are limited to 80,000 characters per file.

## Checks

```bash
npm run build
npm run lint
```

The production build is generated in `dist/`.

## Perfectly Pro accounts

New accounts are Free by default. GPT and Claude models are available only when `perfectly_users.is_pro = TRUE`. Run the following query in the Neon SQL Editor to grant Pro access:

```sql
UPDATE perfectly_users
SET is_pro = TRUE
WHERE email = 'user@example.com';
```

A payment gateway has not been implemented.

## 10. Troubleshooting: blank or black screen

If the page only shows a dark background with no UI:

1. Make sure the Vercel **Root Directory** points to the repository root, not an old nested folder. The project root must directly contain `package.json` and `index.html`.
2. Open Vercel → Deployments → the latest deployment → **Build Logs**. Confirm that `npm install` and `npm run build` completed successfully.
3. Confirm that the output directory is `dist` and that the build contains `index.html` and an `assets/` folder.
4. Open `https://YOUR-DOMAIN/api/health` to check the backend and Neon connection. This endpoint checks the backend, not React rendering.
5. Hard-refresh the browser (`Ctrl + Shift + R`). If the bundle still fails to load, the page should display a startup/error message instead of remaining blank.

If the build log does not show `vite build` or no `dist` folder is created, Vercel may still be using an outdated Root Directory or build configuration.
