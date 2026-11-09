# Runbook

PracticeMMI is a static Next.js site on GitHub Pages. Firebase provides sign-in and storage, so there is no application server.

## Local setup

Requires Node 24 (`nvm use`) and Java 21 or later for the Firebase emulators.

```sh
npm ci
cp .env.example .env.local   # fill in the Firebase web app values
npm run dev
```

## Tests

| Command | Covers |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests |
| `npm run test:rules` | Firestore Security Rules and question storage, on the emulator |
| `npm run test:e2e` | The static export in a browser, with Auth and Firestore emulators |

## Approving a person

In the Firebase console, open Firestore and add a document to the `approvedUsers` collection. Its document ID is the person's Google address in lowercase, and it needs no fields. Delete the document to remove access. The app cannot change this list.

## Deploying

Pushing to `main` deploys the site through `.github/workflows/pages.yml`. The workflow reads these repository variables: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID` and `FIREBASE_APP_ID`.

Security Rules are deployed separately, after any change to `firestore.rules`:

```sh
npm run deploy:rules
```

The Firebase project's authorized domains must include the GitHub Pages host.
