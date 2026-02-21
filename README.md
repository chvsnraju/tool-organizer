# ToolShed AI

ToolShed AI is a smart tool organization and inventory management application designed to help you track, lend, and maintain your tools efficiently. Built with modern web technologies and AI capabilities, it offers a premium user experience on both web and mobile (Android).

## Features

- **Inventory Management** — Track tools with details, photos, tags, and AI-generated specifications
- **AI-Powered Scanning** — Use Google Gemini AI to identify tools from photos, extract details, and suggest categories automatically
- **AI Work Assistant** — Describe a project ("Build a deck") and the AI cross-references your inventory to show what you have and generates a shopping list for what's missing
- **Precision Image Cropping** — Built-in freeform image cropper to perfectly frame tool photos before uploading
- **Lending Tracker** — Track tools lent to friends or colleagues with return dates and notes
- **Maintenance Scheduler** — Schedule recurring maintenance tasks and track service history
- **Location & Container Hierarchy** — Organize tools by Location (e.g. Garage) → Container (e.g. Red Toolbox) → Item
- **Shopping List** — Manage tools to purchase with estimated prices
- **Shared Workspaces** — Share inventory access across multiple users
- **QR Codes** — Generate printable QR codes for items
- **Mobile First** — Native Android app via Capacitor with hardware barcode/QR scanning

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4, Framer Motion, Lucide React |
| Backend / Database | Supabase (PostgreSQL + Storage + Auth) |
| AI | Google Gemini (via `@google/generative-ai`) |
| Mobile | Capacitor 8 (Android) |

---

## Setup Guide

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- A **Supabase** account (free tier works) — [supabase.com](https://supabase.com)
- A **Google Gemini** API key — [aistudio.google.com](https://aistudio.google.com/app/apikey)
- A **Google Cloud** account (for OAuth) — [console.cloud.google.com](https://console.cloud.google.com)
- **Android Studio** + Android SDK (only if building the Android app)

---

### Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project's **URL** and **anon (public) key** from:
   - Dashboard → Project Settings → API

---

### Step 2 — Set Up the Database Schema

In the Supabase Dashboard, go to **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql).

This creates:
- `locations`, `containers`, `items`, `shopping_list`, `tool_loans`, `maintenance_reminders`, `workspaces`, `workspace_members` tables
- Row Level Security (RLS) policies so each user only sees their own data
- Performance indexes

**Then create the two storage buckets** (also in SQL Editor):

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('items', 'items', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('containers', 'containers', true) ON CONFLICT DO NOTHING;
```

And run the storage policies from [`supabase/migration.sql`](supabase/migration.sql) (the `DO $$ ... $$` blocks near the bottom).

---

### Step 3 — Configure Google OAuth

Authentication uses Google Sign-In via Supabase. You need to wire up Google Cloud ↔ Supabase.

#### 3a. Supabase — Enable Google Provider

1. Supabase Dashboard → **Authentication** → **Providers** → **Google** → Enable
2. Copy the **Callback URL** shown (looks like `https://<project-ref>.supabase.co/auth/v1/callback`) — you'll need it in the next step

#### 3b. Google Cloud — Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Under **Authorized redirect URIs**, add the Supabase Callback URL from step 3a
5. Click **Create** — copy the **Client ID** and **Client Secret**

#### 3c. Supabase — Paste the Google Credentials

Back in Supabase Dashboard → Authentication → Providers → Google:
- Paste the **Client ID** and **Client Secret** from step 3b
- Save

#### 3d. Supabase — Add Redirect URLs

Supabase Dashboard → **Authentication** → **URL Configuration** → **Redirect URLs**. Add:

| Environment | URL |
|-------------|-----|
| Android app | `com.ics.toolorganizer://login-callback` |
| Local dev (web) | `https://localhost:5173` |
| Production web | Your deployed URL (e.g. `https://yourapp.netlify.app`) |

---

### Step 4 — Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

> **Note:** The Gemini API key is **not** stored in `.env`. It is entered directly in the app's **Settings** page and saved locally on your device.

---

### Step 5 — Install Dependencies and Run

```bash
npm install
npm run dev
```

Open [https://localhost:5173](https://localhost:5173) in your browser. You'll be prompted to sign in with Google.

After signing in, go to **Settings** and enter your **Gemini API key** to enable AI features.

---

## Building the Android App

### Prerequisites

- Android Studio installed with an Android SDK (API 24+)
- A physical Android device or emulator

### Create a Release Keystore (first time only)

The release build requires a signing keystore. Generate one with:

```bash
keytool -genkey -v \
  -keystore android/app/toolshed-release.keystore \
  -alias toolshed \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Then create `android/keystore.properties` (this file is gitignored):

```properties
storeFile=toolshed-release.keystore
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=toolshed
keyPassword=YOUR_KEY_PASSWORD
```

> Keep your keystore and `keystore.properties` safe — never commit them. Without the keystore you cannot update an already-installed APK.

### Build and Install

Build the web assets, sync to Android, compile, and install in one step:

```bash
# Build release APK
npm run android:release

# Install to a connected device via ADB (bypasses Play Protect prompt)
npm run android:install
```

Or step by step:

```bash
npm run build              # TypeScript check + Vite build
npx cap sync android       # Sync web assets to Android project
cd android
./gradlew clean assembleRelease
```

The signed APK is copied to `toolshed-ai-release.apk` in the project root.

---

## Build Commands Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (HTTPS, host-accessible) |
| `npm run build` | TypeScript check + Vite production build |
| `npm run android:sync` | Build + sync web assets to Android |
| `npm run android:open` | Open Android project in Android Studio |
| `npm run android:apk` | Build debug APK |
| `npm run android:release` | Full release build → signed APK |
| `npm run android:install` | Install APK to connected device via ADB |

---

## Project Structure

```
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/            # Route-level page components
│   ├── lib/              # Supabase client, Gemini AI, helpers
│   └── hooks/            # Custom React hooks
├── android/              # Capacitor Android project
├── supabase/
│   ├── schema.sql        # Full database schema (run on fresh project)
│   └── migration.sql     # Incremental migrations for existing databases
├── public/               # Static assets
└── .env.example          # Environment variable template
```

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](LICENSE)
