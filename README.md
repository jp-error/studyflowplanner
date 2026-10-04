# Studyflow — Smart Study Planner

A responsive, browser-based study planner. It has no package installation or build step.

## Run locally

Serve this folder from localhost so browser storage works consistently:

```powershell
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy with Git and Render

1. Create an empty repository on GitHub, then connect this folder to it. This workspace is already a Git repository on the `master` branch. Replace the sample remote with your GitHub repository URL:

   ```powershell
   git add index.html README.md render.yaml
   git commit -m "Add Studyflow planner"
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin master
   ```

2. In Render, choose **New → Blueprint**, connect that repository, and deploy the `render.yaml` Blueprint. It configures a static site that publishes the repository root; there is no build command.
3. Render will provide the hosted site URL. Later pushes to the connected branch trigger a new deploy.

You can also create a **New → Static Site** in Render and set the publish directory to `.` with the build command left blank.

## Uploaded study materials and saved data

Tasks, subjects, exams, and goals are saved in the browser's local storage. Uploaded files are kept in that browser's IndexedDB and can be grouped by subject, opened (PDF and common image files), downloaded, or removed. Files are limited to 20 MB each.

This is a static app: each browser/device has its own private copy of planner data and uploaded files. Publishing the site does not upload your study files to Render or sync data between devices. Shared accounts, cloud backups, and cross-device file access would require a backend and file storage service.
