<!--
Sync Impact Report:
- Version change: Initial → 1.0.0
- List of modified principles:
  - Added: Mobile-First & Cross-Platform
  - Added: AI-Enhanced Functionality
  - Added: Component-Driven UI
  - Added: Cloud-Synced & Secure
  - Added: Developer Experience
- Added sections: Technology Stack & Standards, Development Workflow
- Removed sections: N/A
- Templates requiring updates:
  - .specify/templates/plan-template.md (✅ updated)
  - .specify/templates/spec-template.md (✅ updated)
  - .specify/templates/tasks-template.md (✅ updated)
- Follow-up TODOs: None.
-->
# ToolShed AI Constitution

## Core Principles

### I. Mobile-First & Cross-Platform
Every feature must function smoothly on mobile devices, considering touch interfaces and screen sizes. The native Android application is built using Capacitor, meaning all web functions must also be compatible with Capacitor's mobile environment and hardware integrations (like barcode scanning and camera).

### II. AI-Enhanced Functionality
Integrating AI is a core feature of the application. Where possible, workflows should leverage Google Gemini or MLKit (e.g., extracting tool details from images, suggesting categories) to minimize manual user entry and maximize convenience.

### III. Component-Driven UI
The user interface is built using React and Tailwind CSS. All new UI work must consist of reusable, modular React components focused on a single responsibility. Inline styles should be avoided in favor of Tailwind utility classes.

### IV. Cloud-Synced & Secure
The backend relies entirely on Supabase (PostgreSQL, Storage, and Auth). All data access must be secured through Row Level Security (RLS) policies. Every feature involving new database tables or columns must include corresponding RLS policies to ensure users only access their own workspaces and data.

### V. Developer Experience
Fast iteration is supported by Vite, TypeScript, and ESLint. All code must pass strict TypeScript compilation and lint checks. No code with known TS errors or lint warnings should be merged.

## Technology Stack & Standards

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS 4, Framer Motion, Lucide React.
- **Backend**: Supabase (PostgreSQL, Storage, Auth).
- **AI Integration**: Google Gemini (`@google/generative-ai`) and Capacitor MLKit for barcode scanning.
- **Mobile Environment**: Capacitor 8 for Android deployment.

## Development Workflow

- **Local Web**: Execute `npm run dev` to start the local Vite server.
- **Testing Requirements**: Any new API integrations or database schemas must be tested against the local context or verified thoroughly in the dev environment. Database changes go into `supabase/migration.sql` or `supabase/schema.sql`.
- **Mobile Builds**: Changes that touch native capabilities must be synced via `npm run android:sync` and tested in an Android environment. Releases are handled via `npm run android:release`.

## Governance

All Pull Requests and code changes must verify compliance with this Constitution. Security policies—specifically Supabase RLS—are mandatory and must be reviewed when data models change. Complexity that violates the "Component-Driven UI" or "Cloud-Synced & Secure" principles must be explicitly justified and documented. 

**Version**: 1.0.0 | **Ratified**: 2026-02-21 | **Last Amended**: 2026-02-21
