# Collaborative Document Editor — Verification and Testing Log

> **NOTICE:** Tests requiring Supabase credentials and backend setup are listed as **REQUIRES CONFIGURATION**. No test is marked **PASSED** unless it has actually been executed against an active environment.
>
> For offline tests (Tests 18–25), a local HTTP server (`npx serve` or VS Code Live Server) and browser DevTools Network offline emulation (or physical network disconnect) are required. Service Workers will not activate over `file:///` protocols.

---

## Table of Contents
1. [Test Execution Summary](#test-execution-summary)
2. [Authentication Tests (Tests 1–9)](#authentication-tests-tests-19)
3. [Document Operation Tests (Tests 10–17)](#document-operation-tests-tests-1017)
4. [Offline Capability Tests (Tests 18–25)](#offline-capability-tests-tests-1825)
5. [Security and Data Integrity Tests (Tests 26–31)](#security-and-data-integrity-tests-tests-2631)

---

## Test Execution Summary

| Test ID | Test Name | Category | Status |
| :--- | :--- | :--- | :--- |
| **TEST 1** | User Registration with Authorized Individual Email | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 2** | User Registration with Authorized Domain Email | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 3** | User Registration Blocked by Frontend Allowlist | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 4** | User Registration Blocked by Server Edge Function | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 5** | Registration Validation: Weak Password & Malformed Email | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 6** | User Login with Valid Registered Credentials | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 7** | User Login Rejection with Incorrect Password | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 8** | User Login Rejection with Non-Existent Account | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 9** | User Logout and Session Token Termination | Authentication | `REQUIRES CONFIGURATION` |
| **TEST 10** | Create New Document with Default Title | Document Operations | `REQUIRES CONFIGURATION` |
| **TEST 11** | Edit Document Title and Content Body | Document Operations | `REQUIRES CONFIGURATION` |
| **TEST 12** | Explicit Document Save via Toolbar Button | Document Operations | `REQUIRES CONFIGURATION` |
| **TEST 13** | Explicit Document Save via Keyboard Shortcut (`Ctrl+S`) | Document Operations | `REQUIRES CONFIGURATION` |
| **TEST 14** | Debounced Background Autosave (2 Seconds Inactivity) | Document Operations | `REQUIRES CONFIGURATION` |
| **TEST 15** | "Save As" Document Duplication with New ID | Document Operations | `REQUIRES CONFIGURATION` |
| **TEST 16** | Document Switching and IndexedDB State Restoration | Document Operations | `REQUIRES CONFIGURATION` |
| **TEST 17** | Document Deletion and Storage Object Cleanup | Document Operations | `REQUIRES CONFIGURATION` |
| **TEST 18** | Service Worker Registration and App Precache Installation | Offline Capability | `REQUIRES CONFIGURATION` |
| **TEST 19** | Offline App Shell Loading via Cache Storage | Offline Capability | `REQUIRES CONFIGURATION` |
| **TEST 20** | Offline Document Creation and Editing in IndexedDB | Offline Capability | `REQUIRES CONFIGURATION` |
| **TEST 21** | Offline Document Autosave and Save State Feedback | Offline Capability | `REQUIRES CONFIGURATION` |
| **TEST 22** | Offline Session Restoration with Visible Warning Banner | Offline Capability | `REQUIRES CONFIGURATION` |
| **TEST 23** | Offline Navigation Across Precached App Routes | Offline Capability | `REQUIRES CONFIGURATION` |
| **TEST 24** | Reconnection Detection and Banner Dismissal | Offline Capability | `REQUIRES CONFIGURATION` |
| **TEST 25** | Offline Login Attempt Handling and Network Feedback | Offline Capability | `REQUIRES CONFIGURATION` |
| **TEST 26** | Supabase Anon Key Isolation (No Service-Role Key) | Security & Integrity | `REQUIRES CONFIGURATION` |
| **TEST 27** | Cross-Site Scripting (XSS) Sanitization in Document Title | Security & Integrity | `REQUIRES CONFIGURATION` |
| **TEST 28** | Cross-Site Scripting (XSS) Sanitization in Document Body | Security & Integrity | `REQUIRES CONFIGURATION` |
| **TEST 29** | Authorized Email Allowlist Confidentiality on Edge Function | Security & Integrity | `REQUIRES CONFIGURATION` |
| **TEST 30** | Protected Route Redirection for Unauthenticated Users | Security & Integrity | `REQUIRES CONFIGURATION` |
| **TEST 31** | Document Data Isolation and User Scoping in IndexedDB | Security & Integrity | `REQUIRES CONFIGURATION` |

---

## Authentication Tests (Tests 1–9)

### TEST 1: User Registration with Authorized Individual Email
**Description:** Verify that a user whose email is explicitly listed in `AUTHORIZED_EMAILS` can successfully register an account.  
**Steps:**
1. Configure `config/authorized-emails.js` with `'user1@example.com'`.
2. Configure Supabase Edge Function secret `AUTHORIZED_EMAILS="user1@example.com"`.
3. Navigate to `http://localhost:3000/register.html`.
4. Enter `user1@example.com` and password `Password123!`.
5. Click **Create Account**.  
**Expected Result:** Registration succeeds. If email confirmation is disabled, user is redirected to `index.html`. If enabled, an email confirmation notice is displayed.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 2: User Registration with Authorized Domain Email
**Description:** Verify that a user whose email matches the configured `AUTHORIZED_DOMAIN` can register without being individually enumerated.  
**Steps:**
1. Configure `config/authorized-emails.js` with `AUTHORIZED_DOMAIN = 'institution.edu'`.
2. Configure Supabase Edge Function secret `AUTHORIZED_DOMAIN="institution.edu"`.
3. Open `http://localhost:3000/register.html`.
4. Enter `faculty@institution.edu` and a strong password.
5. Click **Create Account**.  
**Expected Result:** Domain is recognized as authorized and account creation proceeds successfully.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 3: User Registration Blocked by Frontend Allowlist
**Description:** Verify that an email not present in `config/authorized-emails.js` is rejected immediately at the client level before making external network calls.  
**Steps:**
1. Configure `config/authorized-emails.js` with only `'allowed@example.com'`.
2. Open `http://localhost:3000/register.html`.
3. Enter `unauthorized@example.com` and a valid password.
4. Click **Create Account**.  
**Expected Result:** Form submission halts. An error banner displays: "Email address is not authorized for registration." No network request is dispatched to Supabase Auth.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 4: User Registration Blocked by Server Edge Function
**Description:** Verify that if client-side validation is bypassed, the server-side Edge Function `check-authorized-email` rejects unauthorized registration.  
**Steps:**
1. Leave `REQUIRE_SERVER_SIDE_CHECK = true` in frontend.
2. Ensure the email is not in the server secret `AUTHORIZED_EMAILS`.
3. Attempt registration with the unauthorized email.  
**Expected Result:** The Edge Function returns `{ authorized: false, reason: "Email not authorized for this application." }` with status 200, and signup is aborted.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 5: Registration Validation: Weak Password & Malformed Email
**Description:** Ensure that client-side form validation prevents submission of malformed emails or passwords shorter than 8 characters.  
**Steps:**
1. Open `http://localhost:3000/register.html`.
2. Enter `not-an-email` in the email input and click Submit.
3. Enter a valid authorized email, but enter `123` as the password and click Submit.  
**Expected Result:** HTML5 and JavaScript validation displays appropriate error messages; form does not submit.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 6: User Login with Valid Registered Credentials
**Description:** Verify that an existing, verified user can log in and obtain a valid session.  
**Steps:**
1. Navigate to `http://localhost:3000/login.html`.
2. Enter registered credentials (`user1@example.com` and `Password123!`).
3. Click **Sign In**.  
**Expected Result:** Supabase Auth returns active session tokens, stores them in `localStorage`, and redirects the user to `index.html`.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 7: User Login Rejection with Incorrect Password
**Description:** Verify that entering an incorrect password for an existing account fails gracefully.  
**Steps:**
1. Navigate to `http://localhost:3000/login.html`.
2. Enter a registered email and an incorrect password `WrongPassword!`.
3. Click **Sign In**.  
**Expected Result:** Login fails. An error banner displays "Invalid login credentials." The user remains on `login.html`.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 8: User Login Rejection with Non-Existent Account
**Description:** Verify that attempting to log in with an unregistered email shows an authentication error.  
**Steps:**
1. Navigate to `http://localhost:3000/login.html`.
2. Enter an unregistered email `doesnotexist@example.com` and any password.
3. Click **Sign In**.  
**Expected Result:** Authentication fails with an appropriate error notification.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 9: User Logout and Session Token Termination
**Description:** Verify that clicking Sign Out clears local session tokens and prevents further access to authenticated views.  
**Steps:**
1. While logged in on `index.html`, click the **Sign Out** button in the navigation header.
2. Observe browser redirection to `login.html`.
3. Click the browser "Back" button to return to `index.html`.  
**Expected Result:** Session is cleared in Supabase client and `localStorage`. Attempting to access `index.html` redirects back to `login.html`.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

## Document Operation Tests (Tests 10–17)

### TEST 10: Create New Document with Default Title
**Description:** Verify that creating a new document generates a valid document structure in IndexedDB with default metadata.  
**Steps:**
1. Log in to `index.html`.
2. Click the **+ New Document** button.  
**Expected Result:** A new document is created with a unique UUID, title `"Untitled Document"`, empty content, and current timestamp. It appears in the document list.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 11: Edit Document Title and Content Body
**Description:** Verify that typing in the document title input and content textarea updates the active document buffer.  
**Steps:**
1. Select an open document in `index.html`.
2. Change the title to `"Sprint Planning Notes"`.
3. Type `"Discussion on architectural engines E1-E4."` into the body area.  
**Expected Result:** The UI updates, character and word counters reflect changes, and the save status indicator changes to `"Unsaved changes"`.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 12: Explicit Document Save via Toolbar Button
**Description:** Verify that clicking the Save toolbar button commits changes immediately to IndexedDB.  
**Steps:**
1. Make changes to the document title and body.
2. Click the **Save** button in the header toolbar.  
**Expected Result:** Save status switches to `"Saving..."` then `"Saved"`. Open DevTools → Application → IndexedDB → `collaborative_document_editor` → `documents` to confirm record matches.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 13: Explicit Document Save via Keyboard Shortcut (`Ctrl+S`)
**Description:** Verify that pressing `Ctrl + S` (`Cmd + S` on macOS) triggers the save routine and suppresses default browser page save.  
**Steps:**
1. Type new text into the document body.
2. Press `Ctrl + S` (or `Cmd + S`).  
**Expected Result:** The browser "Save Page As" dialog does NOT appear. Document save initiates, and status changes to `"Saved"`.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 14: Debounced Background Autosave (2 Seconds Inactivity)
**Description:** Verify that modifications are automatically saved to IndexedDB after 2 seconds of user inactivity without manual intervention.  
**Steps:**
1. Enter new text into the document.
2. Cease all typing and mouse interactions.
3. Watch the save status indicator for 2 seconds.  
**Expected Result:** Status moves from `"Unsaved changes"` to `"Saving..."` and finishes at `"Saved"`. IndexedDB reflects the new content.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 15: "Save As" Document Duplication with New ID
**Description:** Verify that "Save As" creates an independent duplicate document with a new ID while leaving the original document intact.  
**Steps:**
1. Open an existing document `"Original Document"`.
2. Click the **Save As** button.
3. Provide the title `"Cloned Document"` and confirm.  
**Expected Result:** A new document is added to IndexedDB with a new unique ID and the title `"Cloned Document"`. The original document retains its original ID and content. The editor switches to the new clone.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 16: Document Switching and IndexedDB State Restoration
**Description:** Verify that switching between documents in the sidebar list correctly persists and restores content from IndexedDB.  
**Steps:**
1. Create Document A (`"Doc A"`, text: `"Content A"`). Save it.
2. Create Document B (`"Doc B"`, text: `"Content B"`). Save it.
3. Click Document A in the sidebar list.  
**Expected Result:** Editor loads Document A's title and content without data leakage from Document B.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 17: Document Deletion and Storage Object Cleanup
**Description:** Verify that deleting a document removes it from both the UI list and the IndexedDB store.  
**Steps:**
1. Select a document from the list.
2. Click the **Delete** icon/button and confirm the confirmation prompt.  
**Expected Result:** The document is deleted from the IndexedDB store. If other documents exist, the editor switches to the nearest document; otherwise, an empty editor state is shown.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

## Offline Capability Tests (Tests 18–25)

### TEST 18: Service Worker Registration and App Precache Installation
**Description:** Verify that `service-worker.js` registers successfully on localhost and precaches all shell assets in `doc-editor-v1`.  
**Steps:**
1. Serve the app over `http://localhost:3000`.
2. Open DevTools → Application → Service Workers.
3. Open DevTools → Application → Cache Storage → `doc-editor-v1`.  
**Expected Result:** Service Worker status is "Activated and running". Cache Storage contains all files listed in `PRECACHE_URLS` (`index.html`, `login.html`, `css/*`, `js/*`, etc.).  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 19: Offline App Shell Loading via Cache Storage
**Description:** Verify that the application loads properly when the browser is disconnected from the network.  
**Steps:**
1. After initial load, open DevTools → Network → Select **Offline** throttling.
2. Reload the page (`Ctrl + R`).  
**Expected Result:** The application shell loads completely from Cache Storage with status 200 (from Service Worker). No broken layout or unstyled content occurs.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 20: Offline Document Creation and Editing in IndexedDB
**Description:** Verify that new documents can be created and existing documents edited while offline.  
**Steps:**
1. Set network to **Offline**.
2. Click **+ New Document**.
3. Type content into the editor and change the title.  
**Expected Result:** Document is created and written directly to IndexedDB without throwing network errors.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 21: Offline Document Autosave and Save State Feedback
**Description:** Verify that autosave and manual save continue to function seamlessly when offline.  
**Steps:**
1. While offline, make edits to a document.
2. Wait 2 seconds for autosave to fire, or press `Ctrl + S`.  
**Expected Result:** Indicator updates to `"Saving..."` and then `"Saved"`. Content is updated in IndexedDB.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 22: Offline Session Restoration with Visible Warning Banner
**Description:** Verify that an offline user with an active cached session can access the editor and sees an offline warning banner.  
**Steps:**
1. Log in while online.
2. Set DevTools Network to **Offline**.
3. Refresh `index.html`.  
**Expected Result:** The session is restored from cached credentials. An alert banner reading `"Working Offline — Changes saved locally"` is visible at the top of the interface.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 23: Offline Navigation Across Precached App Routes
**Description:** Verify navigation between application pages while offline.  
**Steps:**
1. With network set to **Offline**, navigate to `http://localhost:3000/login.html` and `http://localhost:3000/register.html`.  
**Expected Result:** Both pages load from Cache Storage without browser connection error screens.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 24: Reconnection Detection and Banner Dismissal
**Description:** Verify that toggling from offline to online updates the status banner dynamically.  
**Steps:**
1. With the app running offline and displaying the "Working Offline" banner, set DevTools Network to **No throttling** (Online).  
**Expected Result:** `window.addEventListener('online')` triggers. The banner turns green indicating `"Back Online"`, and fades out or dismisses after a brief duration.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 25: Offline Login Attempt Handling and Network Feedback
**Description:** Verify that attempting to log in while offline produces a clear network failure message rather than a silent unhandled promise rejection.  
**Steps:**
1. Set network to **Offline**.
2. Open `login.html`.
3. Submit login credentials.  
**Expected Result:** The UI displays: `"Network unavailable. Please connect to the internet to sign in."` No unhandled console exceptions are logged.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

## Security and Data Integrity Tests (Tests 26–31)

### TEST 26: Supabase Anon Key Isolation (No Service-Role Key)
**Description:** Verify that the frontend codebase contains only the public anon key and that no privileged service-role key is exposed anywhere in the client files.  
**Steps:**
1. Inspect `js/config.js`, `.env.example`, and all frontend scripts in `js/`.
2. Search for `service_role` or secret keys across all client files.  
**Expected Result:** No service-role key exists in frontend files. Only the public anon key placeholder is referenced.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 27: Cross-Site Scripting (XSS) Sanitization in Document Title
**Description:** Verify that malicious script tags in the document title are sanitized before insertion into the DOM.  
**Steps:**
1. In the document title input, enter: `<script>alert('XSS-TITLE')</script>New Doc`.
2. Save the document and refresh the page.
3. Observe title rendering in the sidebar list and main heading.  
**Expected Result:** No alert dialog triggers. The string is sanitized or escaped via `js/security.js` and rendered as plain text.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 28: Cross-Site Scripting (XSS) Sanitization in Document Body
**Description:** Verify that injected HTML/script payloads in the document body do not execute.  
**Steps:**
1. In the document body area, enter: `<img src="invalid" onerror="alert('XSS-BODY')">`.
2. Save and trigger reload/preview.  
**Expected Result:** No script executes. Any preview elements or rendered text nodes strip or escape executable attributes.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 29: Authorized Email Allowlist Confidentiality on Edge Function
**Description:** Verify that unauthenticated client requests to `check-authorized-email` do not expose the complete allowlist of authorized email addresses.  
**Steps:**
1. Send a POST request to the Edge Function endpoint with an arbitrary email:
   ```json
   { "email": "random@example.com" }
   ```
2. Inspect the HTTP response headers and body.  
**Expected Result:** Response returns `{ "authorized": false, "reason": "Email not authorized for this application." }`. The array of authorized emails is never included in the response.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 30: Protected Route Redirection for Unauthenticated Users
**Description:** Verify that attempting to load `index.html` without a valid Supabase session redirects to `login.html`.  
**Steps:**
1. Clear browser `localStorage` and `sessionStorage`.
2. Navigate directly to `http://localhost:3000/index.html`.  
**Expected Result:** The authentication check fails, preventing editor initialization, and immediately redirects the browser to `login.html`.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.

---

### TEST 31: Document Data Isolation and User Scoping in IndexedDB
**Description:** Verify that documents created in IndexedDB are associated with the authenticated user ID and cannot be accessed or modified by another user on the same browser profile.  
**Steps:**
1. Log in as User A and create Document 1.
2. Sign out and log in as User B.  
**Expected Result:** User B's document list does not display Document 1. IndexedDB queries filter documents by the active user's UUID.  
**Status:** REQUIRES CONFIGURATION  
**Actual Result:** Not yet tested — requires Supabase credentials and authorized email configuration.
