# Auth submit → redirect to dashboard

## Problem
On the landing page (`index.html`), selecting a package in the "Vyberte si svůj kapitál" section and
clicking "Koupit výzvu" opens the auth modal in register mode (`data-auth="register"`). Submitting
that form (or the plain login form) currently only simulates a delay and shows a static note
("Toto je designový náhled, účty zatím nejsou připojené.") — it never takes the user anywhere.
`dashboard.html` is a fully working page, so the purchase/login flow dead-ends before reaching it.

## Goal
After a successful auth form submit (both `login` and `register` modes), redirect the user to
`dashboard.html`, so the flow landing → pick package → "Koupit výzvu" → register/login → dashboard
works end-to-end, matching how it used to work.

## Scope
- Touch only `js/main.js`, inside the existing `authForm.addEventListener("submit", ...)` handler
  (around lines 268–279).
- Keep the short "Přihlašování…" / "Vytváření účtu…" loading state on the submit button for
  perceived feedback, then navigate via `window.location.href = "dashboard.html"`.
- Remove the "design preview" note path (or let it be superseded immediately by the redirect).
- No persistence/propagation of the selected package into the dashboard — explicitly out of scope
  per user decision (redirect only, no data wiring).
- No other files change.

## Out of scope (explicitly deferred)
- Passing selected package (capital/price) into `dashboard.html` via localStorage.
- Real authentication/backend — this stays a client-side design preview, just no longer a dead end.
- Match detail page, investor portal, admin panel — separate follow-up work, not part of this change.
