# ToolShed AI - Agent Instructions

## Project Vision & Scope

**Problem**: Homeowners accumulate tools and hardware across multiple locations (garage, shed, workshop, kitchen drawers, etc.) and lose track of what they own and where it's stored. When starting a project, they waste time searching or buy duplicates.

**Solution**: ToolShed AI is a mobile app that lets users:
1. **Photograph locations/containers** (shelves, toolboxes, drawers) to establish a storage hierarchy
2. **Photograph individual tools/items** — AI (Google Gemini) automatically identifies the item, categorizes it, extracts specs, and suggests what it can be used for
3. **Index and organize** everything in a searchable, browsable inventory with location tracking
4. **Plan projects** — describe a job ("build a deck", "fix a leaky faucet") and the AI cross-references the user's inventory to show what tools they already own and what they still need to buy
5. **Shopping list** — missing tools from project analysis are added to a shopping list with estimated prices

### Current Features (Implemented)
- Location → Container → Item hierarchy with images
- AI-powered tool identification from photos (Gemini 2.0 Flash)
- Item management with specs, condition tracking, quantity, tags, categories
- Full-text search and category filtering across inventory
- AI Work Assistant with project planner + chat interface
- Tool Lending Tracker (track loans with due dates)
- Maintenance Scheduler (item-specific tasks, recurring reminders)
- Shopping list with auto-populate from project analysis
- Android APK builds via Capacitor
- Supabase backend with RLS for multi-user support

### Database Tables
- **locations** — physical storage areas (garage, shed, etc.)
- **containers** — specific spots within locations (shelf, drawer, bin)
- **items** — individual tools with rich metadata (specs, condition, quantity, images, tags)
- **tool_loans** — tracking for lent items
- **maintenance_reminders** — scheduled tasks for items
- **shopping_list** — tools to purchase

## After Every Code Change

After completing any code changes, always perform these steps:

### 1. Build and Verify
```bash
npm run build
```
Fix any TypeScript or build errors before proceeding.

### 2. Build Release APK and Install
Build, sign, and copy APK in one step:
```bash
npm run android:release
```
Or manually:
```bash
npm run build && npx cap sync android
cd android && ./gradlew clean assembleRelease
cp android/app/build/outputs/apk/release/app-release.apk toolshed-ai-release.apk
```

Then install to a connected device via adb (bypasses Play Protect scan prompt):
```bash
npm run android:install
```
Or manually:
```bash
~/Library/Android/sdk/platform-tools/adb install -r toolshed-ai-release.apk
```

**Important - APK Signing**: The release build uses V2 APK signing (configured in `android/app/build.gradle`). Do NOT modify the signing config. Always use `clean assembleRelease` for fresh signed builds. The signing config in build.gradle must keep `v1SigningEnabled true` and `v2SigningEnabled true` along with `debuggable false` in the release buildType.

**Important - Play Protect**: Google Play Protect shows "App Scan Required" for ALL sideloaded APKs from unknown developers. This cannot be bypassed from the app side. Always use `adb install` (via `npm run android:install`) to install to a connected device — this bypasses Play Protect entirely.

### 3. Run Database Migrations (if schema changed)
If any database schema changes were made (new columns, tables, etc.), run migrations using Node.js `pg` module:

```bash
npm install --no-save pg
```

Then execute SQL via Node.js:
```javascript
node -e "
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL, // Use env var: postgres://user:password@host:port/db
  ssl: { rejectUnauthorized: false }
});
(async () => {
  await client.connect();
  // Run your ALTER TABLE / CREATE TABLE statements here
  await client.query('YOUR SQL HERE');
  console.log('Migration complete');
  await client.end();
})().catch(e => { console.error(e); process.exit(1); });
"
```

Update `supabase/migration.sql` with any new migration SQL for reference.

## Project Structure

- **Framework**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **Mobile**: Capacitor 8 (Android)
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini via `@google/generative-ai`
- **Web dir**: `dist/` (Capacitor serves from here)

## Key Paths

- Release keystore: `android/app/toolshed-release.keystore`
- APK output: `android/app/build/outputs/apk/release/app-release.apk`
- DB connection docs: `DATABASE.md`
- Schema: `supabase/schema.sql`
- Migrations: `supabase/migration.sql`
- Capacitor config: `capacitor.config.ts`

## Build Commands Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with host access |
| `npm run build` | TypeScript check + Vite production build |
| `npm run android:sync` | Build + sync to Android |
| `npm run android:open` | Open in Android Studio |
| `npm run android:apk` | Build debug APK |
| `npm run android:release` | Full build + sign + copy release APK |
| `npm run android:install` | Install APK to connected device via adb |
