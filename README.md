# Studyflow — Smart Study Planner

A responsive, browser-based study planner. It has no package installation or build step.

## Pomodoro timer

- 25-minute focus sessions, 5-minute short breaks, and 15-minute long breaks.
- After every four focus sessions, the next suggested break is a long break.
- Start, pause, resume, reset, or switch timer modes. A finished focus block suggests a break, and a finished break suggests returning to focus; the next block does not start automatically.
- The timer and completed focus-session count are saved in this browser and restored after refresh.

## Run locally

Serve this folder from localhost so browser storage works consistently:

```powershell
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy with Git and Render

The `render.yaml` Blueprint configures a static site that publishes this repository's root; there is no build command. In Render, choose **New → Blueprint**, connect the repository, and deploy. Later pushes to the connected branch trigger a new deploy.

You can also create a **New → Static Site** in Render and set the publish directory to `.` with the build command left blank.

## Uploaded study materials and saved data

Tasks, subjects, exams, goals, and Pomodoro timer state are saved in the browser's local storage. Uploaded files are kept in that browser's IndexedDB and can be grouped by subject, opened (PDF and common image files), downloaded, or removed. Files are limited to 20 MB each.

This is a static app: each browser/device has its own private copy of planner data and uploaded files. Publishing the site does not upload your study files to Render or sync data between devices. Shared accounts, cloud backups, and cross-device file access would require a backend and file storage service.
