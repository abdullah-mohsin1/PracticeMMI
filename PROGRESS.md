# Progress

## Current state

PracticeMMI is now a private practice tool for a few friends, hosted as a static site on GitHub Pages with Firebase for sign-in and storage. Earlier phases targeted Cloudflare, Cognito and Neon and have been superseded.

## Completed

- Static export for GitHub Pages, with the Cloudflare and OpenNext deployment removed.
- Google sign-in through Firebase Authentication, open to any Google account.
- Private question libraries in Firestore, with ownership enforced by Security Rules using the Firebase UID.
- GitHub Actions for tests and Pages deployment.

## MMI simulator (branch `feature/practice-ui`), November 9, 2026

Timed practice now runs in the browser using the existing Firebase sign-in and question library: question selection (library, PDF imports and one-off prompts), custom sessions and the eight-station mock, camera preview, recording, automatic phase changes, playback, downloads, and editable transcripts. Recordings stay in the browser's IndexedDB.

**Verified on real Chrome with a fake camera and microphone:** a six-minute answer (file length 359.9996 s, countdown within 0.12 s of the clock), the eight-station mock (119.9 s break), and, before the Firebase merge, six minutes in a hidden tab (recording 390.00 s).

**Unverified: real microphone transcription.** Browser tests use a simulated speech recogniser. To test it, run `REAL_SPEECH=1 npm run test:e2e:long` and speak to the computer.

**Open:** Chrome-only testing so far. No test has used a physical camera or microphone. Two question-editing screens now exist (`/` and `/questions/`).

## Next steps

- Create the Firebase project and deploy the rules.
- Deploy to GitHub Pages and test sign-in on the live site.
