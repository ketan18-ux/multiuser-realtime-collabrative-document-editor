# Collaborative Multi-User Real-Time Document Editor

A browser-based, offline-first document editor built with modern Vanilla JavaScript ES modules and Supabase Auth. This application provides robust local document management, client-side persistence with IndexedDB, offline capability powered by Service Workers, and an email-authorization gating system.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Current Implementation Scope](#current-implementation-scope)
4. [Technology Stack](#technology-stack)
5. [Project Folder Structure](#project-folder-structure)
6. [Prerequisites](#prerequisites)
7. [Quick Start](#quick-start)
8. [Supabase Setup](#supabase-setup)
9. [Authorized Email Configuration](#authorized-email-configuration)
10. [Running the Local Dev Server](#running-the-local-dev-server)
11. [How to Register](#how-to-register)
12. [How to Log In](#how-to-log-in)
13. [How to Create Documents](#how-to-create-documents)
14. [How Save Works](#how-save-works)
15. [How Save As Works](#how-save-as-works)
16. [Where Documents Are Stored](#where-documents-are-stored)
17. [How Offline Mode Works](#how-offline-mode-works)
18. [Current Limitations](#current-limitations)
19. [Future Collaboration Plans](#future-collaboration-plans)
20. [Proposed Future Database Schema (PLANNED)](#proposed-future-database-schema-planned)
21. [Security Notes](#security-notes)
22. [Testing](#testing)

---

## Project Overview

The **Collaborative Multi-User Real-Time Document Editor** is engineered to combine cloud-authenticated user security with resilient offline document editing. 

**Current Phase:** Authenticated, offline-first, multi-document local editor.
In this foundational release, users register and authenticate against Supabase Auth with an email-authorization gate. Once authenticated, users can create, edit, rename, duplicate ("Save As"), auto-save, and organize multiple documents. All document data is persisted locally in IndexedDB (`collaborative_document_editor`), while application assets are precached by a Service Worker to allow full offline productivity.

---

## Architecture

The project adheres to a **Layered Client–Server Architecture with Modular Engines**. 

```
+-----------------------------------------------------------------------------------+
|                            Presentation Layer (DOM / UI)                         |
|    index.html (Editor Workspace)  |  login.html  |  register.html  |  css/        |
+-----------------------------------------------------------------------------------+
                                        |
+-----------------------------------------------------------------------------------+
|                        Client Application Modules (ES Modules)                    |
|  app.js  <-->  auth.js  <-->  documents.js  <-->  editor.js  <-->  offline.js   |
|         \           \              |              /          /                    |
|          +-------- security.js ----+-------------+----------+                     |
+-----------------------------------------------------------------------------------+
        |                                                   |
+-----------------------------------+   +-------------------------------------------+
|      Local Storage & Cache        |   |           Modular Engine Layer            |
| - IndexedDB: document data        |   |  - Engine E1: Document & State Management |
| - Cache Storage: app shell        |   |  - Engine E2: Real-Time Synchronization   |
| - Service Worker: offline routing |   |  - Engine E3: Awareness & Presence        |
+-----------------------------------+   |  - Engine E4: Persistence & Cloud Sync    |
                                        |    *(Engines E1-E4 are stubs in Phase 1)* |
                                        +-------------------------------------------+
                                                            |
+-----------------------------------------------------------------------------------+
|                       Cloud Backend Layer (Supabase Platform)                     |
|  - Supabase Auth (Active: Session token handling via anon key)                    |
|  - Supabase Edge Functions (Active: check-authorized-email server-side secret)    |
|  - Supabase PostgreSQL + Realtime WebSockets (PLANNED for Phase 2)               |
+-----------------------------------------------------------------------------------+
```

### Modular Engines (E1–E4) Overview
- **Engine E1 (Document & State Management / Operation Engine):** Coordinates document lifecycle, in-memory state representation, and change history. Stubbed in Phase 1; planned for operational transformation or CRDT-based state reconciliation.
- **Engine E2 (Real-Time Synchronization Engine):** Manages multi-client synchronization over WebSockets. Stubbed in Phase 1.
- **Engine E3 (Awareness & Presence Engine):** Tracks peer presence, cursor locations, and active selections. Stubbed in Phase 1.
- **Engine E4 (Persistence & Cloud Sync Engine):** Coordinates bidirectional background synchronization between local IndexedDB and cloud PostgreSQL. Stubbed in Phase 1.

---

## Current Implementation Scope

The following 12 features are fully implemented:

1. **User Authentication:** Complete sign-up, sign-in, session maintenance, and sign-out powered by Supabase Auth (`@supabase/supabase-js`).
2. **Authorized Email Gating:** Dual-layer verification blocking unauthorized registrations via frontend configuration (`config/authorized-emails.js`) and authoritative serverless Edge Function (`check-authorized-email`).
3. **Document Management:** Full CRUD operations on document metadata and bodies (create, retrieve, list, rename, delete).
4. **Multi-Document Support:** Seamless switching between multiple documents stored in the local database with an active document switcher UI.
5. **Document Editing Interface:** Fast, responsive document workspace featuring dedicated title input, content area, word count, character count, and last-saved timestamps.
6. **Local Persistence via IndexedDB:** Storage within the `collaborative_document_editor` IndexedDB database, isolating document content and metadata in client-side object stores.
7. **Explicit Save & Autosave:** Manual saving via Save button and `Ctrl+S` (`Cmd+S`) shortcut, augmented by an automatic 2-second debounced background autosave with real-time status indicators (Saved / Unsaved changes / Saving...).
8. **"Save As" Duplicate Workflow:** Dedicated "Save As" functionality creating an independent clone of the active document with a new UUID and distinct title, leaving the original intact.
9. **Offline-First Application Caching:** Service Worker (`service-worker.js`) precaching the full application shell (HTML, CSS, JS, and config) to Cache Storage.
10. **Offline Session Continuity:** Local session validation enabling authenticated users to continue reading, editing, and creating documents even when internet connectivity drops, complete with persistent offline warning banners.
11. **Security & Content Sanitization:** Centralized sanitization module (`js/security.js`) preventing Cross-Site Scripting (XSS) before rendering or committing data, strict isolation of the Supabase anon key, and zero exposure of service-role privileges.
12. **Status Feedback & Network Awareness:** Real-time online/offline network status detection (`navigator.onLine` and window events), save states, and accessible alert banners.

---

## Technology Stack

- **Markup & Styling:** HTML5, CSS3 (Modern responsive custom properties, CSS Grid, and Flexbox).
- **Client Logic:** Vanilla JavaScript ES Modules (`import`/`export`), no bundler, no transpilation, zero npm runtime dependencies.
- **Authentication:** Supabase Auth via official CDN ES module (`@supabase/supabase-js`).
- **Local Persistence:** Browser Native IndexedDB API (`collaborative_document_editor`).
- **Offline Architecture:** Service Worker API, Cache Storage API (`doc-editor-v1`).
- **Serverless / Gatekeeper:** Supabase Edge Functions (Deno / TypeScript).
- **Future Database:** Supabase PostgreSQL with Row Level Security (RLS) (Planned).

---

## Project Folder Structure

```
e:/document-project/
├── .env.example                               # Environment template for developer reference
├── .gitignore                                  # Git exclusion rules (keeps public config, ignores secrets)
├── index.html                                  # Main application shell (Editor workspace)
├── login.html                                  # User login interface
├── register.html                               # User registration interface
├── service-worker.js                           # Service worker for offline asset caching
├── README.md                                   # Project documentation and architecture guide
├── TESTING.md                                  # Verification and testing test suite
├── config/
│   └── authorized-emails.js                    # Frontend email authorization allowlist and domain rules
├── css/
│   ├── auth.css                                # Styles for login and registration views
│   └── style.css                               # Editor layout, toolbar, sidebar, and banners
├── js/
│   ├── app.js                                  # Application entry point & module orchestration
│   ├── auth.js                                 # Authentication controller & session state
│   ├── config.js                               # Public Supabase URL & anon key (placeholder)
│   ├── database.js                             # IndexedDB wrapper (collaborative_document_editor)
│   ├── documents.js                            # Document collection manager & metadata state
│   ├── editor.js                               # Text editing, autosave debounce, & keyboard shortcuts
│   ├── offline.js                              # Network connectivity monitors & banner controls
│   ├── security.js                             # XSS sanitization & input validation utilities
│   └── supabase-client.js                      # Supabase client initializer
└── supabase/
    └── functions/
        └── check-authorized-email/
            └── index.ts                        # Authoritative Deno Edge Function for registration gate
```

---

## Prerequisites

1. **Modern Web Browser:** Chrome 90+, Firefox 90+, Safari 15+, or Edge 90+ (with IndexedDB and Service Worker support).
2. **Local Static HTTP Server:** A static file server such as VS Code Live Server, Python `http.server`, or Node `npx serve`. (Required: Service Workers do not run on `file:///` protocols).
3. **Supabase Account:** A free account at [supabase.com](https://supabase.com).

---

## Quick Start

1. **Clone or Download:** Extract the project files to your local workspace (`e:/document-project/`).
2. **Start a Local Server:**
   ```bash
   # Option A: Using Node.js serve
   npx serve . -p 3000

   # Option B: Using Python 3
   python -m http.server 3000
   ```
3. **Configure Supabase:** Add your project URL and public anon key into `js/config.js` (see [Supabase Setup](#supabase-setup)).
4. **Configure Authorized Emails:** Add your email to `config/authorized-emails.js` and set the secret in Supabase (see [Authorized Email Configuration](#authorized-email-configuration)).
5. **Open Application:** Navigate to `http://localhost:3000/register.html` in your browser. Register your account and begin editing!

---

## Supabase Setup

1. **Create Project:**
   - Log into [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
   - Choose a region close to your team and set a strong database password.

2. **Retrieve API Credentials:**
   - Navigate to **Project Settings** → **API**.
   - Copy the **Project URL** (e.g., `https://your-project-ref.supabase.co`).
   - Copy the **anon / public** key.
   - ⚠️ **CRITICAL SECURITY WARNING:** NEVER copy or reveal the `service_role` secret key. The `service_role` key must NEVER be included in frontend code.

3. **Update Frontend Configuration:**
   - Open `js/config.js` in your editor.
   - Replace the placeholders with your values:
     ```js
     export const SUPABASE_URL = 'https://your-project-ref.supabase.co';
     export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
     ```

4. **Authentication Settings:**
   - In Supabase Dashboard, navigate to **Authentication** → **URL Configuration**.
   - Set **Site URL** to `http://localhost:3000` (or your local development URL).
   - Add `http://localhost:3000/**` to **Redirect URLs**.
   - Under **Authentication** → **Providers** → **Email**, choose whether to enable "Confirm email" (recommended for production).

---

## Authorized Email Configuration

To restrict account creation to designated team members or institutional domains, a dual-layer gating mechanism is implemented:

### 1. Frontend UX Check (`config/authorized-emails.js`)
Edit `config/authorized-emails.js` to define authorized emails or domains:
- **Option A (Allowlist):**
  ```js
  export const AUTHORIZED_EMAILS = [
    'alice@example.com',
    'bob@example.com'
  ];
  export const AUTHORIZED_DOMAIN = null;
  ```
- **Option B (Domain Allowlist):**
  ```js
  export const AUTHORIZED_EMAILS = [];
  export const AUTHORIZED_DOMAIN = 'myuniversity.edu';
  ```

### 2. Server-Side Enforcement (Supabase Edge Function)
The frontend check is solely for user convenience. The trusted gate is the Edge Function `check-authorized-email`.

1. Install Supabase CLI and log in:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
2. Deploy the function:
   ```bash
   supabase functions deploy check-authorized-email
   ```
3. Set secrets in **Supabase Dashboard** → **Edge Functions** → **Secrets** (or via CLI):
   ```bash
   supabase secrets set AUTHORIZED_EMAILS="alice@example.com,bob@example.com"
   supabase secrets set AUTHORIZED_DOMAIN="myuniversity.edu"
   ```

> **Security Note:** The server-side Edge Function evaluates registration requests against these private environment variables. The full allowlist is never exposed or transmitted to the client.

---

## Running the Local Dev Server

Service Workers and modern ES modules require an HTTP/HTTPS origin. Browsers will refuse Service Worker registration on `file:///` URLs.

### Using VS Code Live Server
1. Install the "Live Server" extension (`ritwickdey.liveserver`) in VS Code.
2. Right-click `index.html` and select **Open with Live Server**.
3. Live Server serves the app at `http://127.0.0.1:5500`.

### Using Node.js `serve`
```bash
npx serve . -p 3000
```
Open `http://localhost:3000`.

---

## How to Register

1. Open `http://localhost:3000/register.html`.
2. Input an authorized email address and strong password (minimum 8 characters).
3. Click **Create Account**.
4. The client will verify the email against the local authorization list, invoke the Edge Function gate, and register the user via Supabase Auth.
5. If email confirmation is enabled, check your inbox and verify your address. Otherwise, you will be redirected to the editor.

---

## How to Log In

1. Open `http://localhost:3000/login.html`.
2. Enter your registered email and password.
3. Click **Sign In**.
4. Upon authentication, Supabase Auth stores your session tokens in browser `localStorage`.
5. You are redirected to `index.html`.
6. **Session Restoration:** When returning to `index.html`, the application automatically validates the cached session and loads your workspace without requiring re-login.

---

## How to Create Documents

1. In the editor interface (`index.html`), click the **+ New Document** button located in the sidebar or top action bar.
2. A new document record is generated with a unique ID (UUID v4), creation timestamp, and the default title `"Untitled Document"`.
3. The new document is automatically loaded into the active editor, ready for typing.

---

## How Save Works

- **Manual Save:** Click the **Save** button in the header toolbar or press `Ctrl + S` (`Cmd + S` on macOS).
- **Autosave (Debounced):** As you type in either the title or body area, a 2-second debounce timer runs. If no new keystrokes are registered for 2 seconds, the document automatically commits to IndexedDB.
- **Status Indicator:**
  - `Saved` (green check): All edits match the local database.
  - `Unsaved changes` (orange dot): Edits have occurred since the last commit.
  - `Saving...` (blue spinner): Active IndexedDB transaction in progress.

---

## How Save As Works

1. Open the document you wish to duplicate.
2. Click the **Save As** button in the toolbar.
3. A modal or prompt will ask for the new document title (defaults to `Copy of [Original Title]`).
4. A brand new document is created with:
   - A unique ID.
   - The new title.
   - A complete copy of the current content.
   - Fresh creation and modification timestamps.
5. The original document remains unchanged in IndexedDB, and the editor switches to the newly cloned document.

---

## Where Documents Are Stored

- **IndexedDB (`collaborative_document_editor`):**
  - All document records (id, title, content, timestamps, user ID) are stored in client-side IndexedDB object stores.
  - Documents remain persisted across browser restarts and tab closures.
- **Service Worker Cache (`doc-editor-v1`):**
  - Caches only static application shell files (`.html`, `.css`, `.js`).
  - **Does NOT store documents.**
- **Supabase Auth (`localStorage`):**
  - Caches authenticated user sessions, JWT tokens, and user metadata.
- **Supabase PostgreSQL:**
  - **PLANNED** for a future release. Cloud synchronization is not currently active in Phase 1.

---

## How Offline Mode Works

1. **Initial Visit:** The user visits the app while online. The Service Worker installs and caches all assets defined in `PRECACHE_URLS`.
2. **Offline Transitions:**
   - When the user loses internet access, the Service Worker intercepts network requests and serves the cached files (`cache-first`).
   - The user interface immediately displays an amber **"Working Offline"** banner.
3. **Editing While Offline:**
   - Because document data is managed directly in IndexedDB, users can read, edit, save, and create documents without any network access.
4. **Offline Session Continuity:**
   - The app verifies whether a valid session token exists in local storage. If present, the user can continue their editing session uninterrupted.
5. **Reconnection:**
   - When connectivity resumes (`window.addEventListener('online')`), the banner shifts to a transient green **"Back Online"** state and dismisses.
   - *Note:* `navigator.onLine` provides a browser-level network status hint and does not guarantee that Supabase servers are reachable.

---

## Current Limitations

- **No Real-Time Multi-User Synchronization:** Concurrent edits across different browsers or tabs do not merge in real time in Phase 1.
- **No Cloud Backup:** Documents exist exclusively in the user's browser IndexedDB storage. Clearing browser site data will remove local documents.
- **No Cross-Device Roaming:** A document created on one machine is not visible on another machine.
- **Offline Auth Scope:** Full authentication requires online connectivity. Offline sessions rely on locally preserved session tokens.
- **Local Server Requirement:** The Service Worker requires `localhost` or an HTTPS origin to activate.

---

## Future Collaboration Plans

Subsequent project phases will introduce full multi-user real-time capabilities:
- **Engine E1:** Implementation of Conflict-free Replicated Data Types (CRDTs via Yjs or Automerge) for seamless character-by-character conflict resolution.
- **Engine E2:** Integration of Supabase Realtime WebSockets for sub-100ms multi-user message broadcast.
- **Engine E3:** Peer awareness, shared cursor positioning, selection highlights, and presence avatars.
- **Engine E4:** Seamless two-way cloud persistence synchronizing local IndexedDB documents with Supabase PostgreSQL tables.

---

## Proposed Future Database Schema (PLANNED)

The following schema is planned for Phase 2 cloud synchronization. It is **not yet implemented** in the current phase:

```sql
-- =============================================================================
-- PLANNED DATABASE SCHEMA (FOR FUTURE PHASES - NOT YET IMPLEMENTED)
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Profiles (mirrors Supabase auth.users)
CREATE TABLE public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Documents Table
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Document',
    content TEXT DEFAULT '',
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Document Members (Collaborators & Permissions)
CREATE TABLE public.document_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    permission_level TEXT NOT NULL CHECK (permission_level IN ('view', 'comment', 'edit', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(document_id, user_id)
);

-- Document Version History
CREATE TABLE public.document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    snapshot_content TEXT NOT NULL,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Row Level Security (RLS) Policies (Planned)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- Documents RLS: Owners and Members can view and edit
CREATE POLICY "Users can access documents they own or collaborate on"
    ON public.documents
    FOR ALL
    USING (
        auth.uid() = owner_id OR
        EXISTS (
            SELECT 1 FROM public.document_members
            WHERE document_members.document_id = documents.id
            AND document_members.user_id = auth.uid()
        )
    );
```

---

## Security Notes

1. **Supabase Keys:** Only the public `anon` key is used in frontend files (`js/config.js`). The privileged `service_role` key must **never** be added to client code.
2. **Authorized Email Protection:** The list of authorized emails is kept private inside Supabase Edge Function secrets and is never transmitted to untrusted clients.
3. **XSS Defense:** All user-controlled text (titles, body content, email handles) is sanitized through `js/security.js` prior to insertion into the DOM.
4. **Session Token Safety:** JWT tokens are managed through Supabase Auth's official client with secure local storage handlers and automatic expiration checks.

---

## Testing

For complete manual verification protocols, test cases, and reproduction steps across Authentication, Document Operations, Offline Functionality, and Security, please review [TESTING.md](TESTING.md).
