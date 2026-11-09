# Progress

## Current state

PracticeMMI is now a private practice tool for a few friends, hosted as a static site on GitHub Pages with Firebase for sign-in and storage. Earlier phases targeted Cloudflare, Cognito and Neon and have been superseded.

## Completed

- Static export for GitHub Pages, with the Cloudflare and OpenNext deployment removed.
- Google sign-in through Firebase Authentication, limited to people on an approved list.
- Personal questions in Firestore, with create, read, edit and delete, and ownership enforced by Security Rules.
- GitHub Actions for tests and Pages deployment.

## Next steps

- Create the Firebase project and deploy the rules.
- Deploy to GitHub Pages and test sign-in on the live site.
