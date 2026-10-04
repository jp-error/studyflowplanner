# Studyflow — Smart Study Planner

Studyflow is a personal study planner with separate username/password accounts. Subjects, study tasks, exams, and weekly goals are saved to PostgreSQL for the signed-in account. Study materials can be added, previewed, downloaded, and removed; file contents stay in that browser's local storage.

## Deploy from GitHub to Render

This project is a Node web service, not a static site. The `render.yaml` Blueprint creates a new web service and a PostgreSQL database. Your existing static site can remain available while you try the new service; open the URL for `studyflow-account-app` after it deploys.

1. Create a separate branch in GitHub (for example, `account-login`) so your current static site can stay on its existing branch. Open that branch in Codespaces.
2. Replace `index.html`, `render.yaml`, and `README.md`, and add `app.js`, `server.js`, and `package.json` at the repository root. Save and commit these changes to the new branch.
3. In Render, choose **New** → **Blueprint**, connect the repository, and select the `account-login` branch.
4. Render reads `render.yaml`. Review the service and database, then apply the Blueprint.
5. Wait for the web service to finish deploying. Open its `onrender.com` URL and create an account.

The new service is named `studyflow-account-app` so it does not attempt to turn the existing static service into a different runtime. Render does not allow static sites to change into Node web services. The new web service provides the server-side login and account-specific planner storage.

## Free database trial

The included Blueprint selects Render's free PostgreSQL plan, as requested for a short trial. **Free Render PostgreSQL databases expire 30 days after creation.** After expiry, the database is inaccessible; Render gives 14 additional days to upgrade before deleting it and its data. Upgrade the database before its expiry date to keep user accounts and planner data. Free web services can also spin down while idle, so the first page load after inactivity may take a little longer.

## What is saved where

- Accounts, password hashes, sessions, subjects, tasks, exams, and weekly goals are stored on the server in PostgreSQL. Passwords are salted and hashed; they are never stored as plain text.
- Study material file contents stay in that browser's IndexedDB and are separated by account on that browser. They do not sync to other devices and are not stored in PostgreSQL.
- No API keys or manually entered environment variables are needed for the Render Blueprint. It connects the web service to its database using `DATABASE_URL`.

## Local development

Use Node.js 20 or newer and a PostgreSQL database. Set `DATABASE_URL` to the database connection string, install dependencies, and start the app with the `start` script in `package.json`. The server listens on the port supplied by the host (or port 10000 locally).
