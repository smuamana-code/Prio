# Task Ranker

A task prioritization app: dump tasks, sort them into categories, rank them by
gut-feel pairwise battles (binary-insertion sort), set per-day scheduling rules,
and export the week as a `.ics` file for Google Calendar. No backend, no API
keys — everything runs in the browser, and your data is saved locally.

## Run it on your computer first (optional)

You need Node.js installed (https://nodejs.org). Then in this folder:

```
npm install
npm run dev
```

Open the printed `localhost` address. That's the app running locally.

## Put it online with Vercel (free)

You don't need the command line for this.

1. Create a free account at https://github.com and click "New repository".
   Name it `task-ranker`, leave it public, and create it.
2. On the new repo page, click "uploading an existing file" and drag in
   EVERY file and folder from this project EXCEPT `node_modules` (you may not
   have that folder yet anyway — that's fine). The important ones are:
   `package.json`, `vite.config.js`, `index.html`, `.gitignore`, and the
   `src` folder (with `main.jsx` and `TaskRanker.jsx` inside it).
3. Commit the upload.
4. Go to https://vercel.com and sign in with your GitHub account (free).
5. Click "Add New… → Project", pick your `task-ranker` repo, and click
   "Import". Vercel auto-detects Vite — just click "Deploy".
6. After about a minute you'll get a URL like `task-ranker.vercel.app`.

## Use it like an app on your phone

Open your Vercel URL in your phone's browser, then:

- iPhone (Safari): Share → "Add to Home Screen"
- Android (Chrome): menu (⋮) → "Add to Home screen"

It opens full-screen with its own icon, and your tasks persist between visits.

## Importing the schedule into Google Calendar

After you export `my-week.ics` from the app:
Google Calendar → Settings → Import & export → select the file → Import.
This adds the tasks as a one-time batch of calendar events.
