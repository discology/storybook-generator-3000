# Getting started

How to run Storybook Generator 3000 on your own computer.

## What you need

- **Node.js 22 or newer.** The app is developed on Node 24.
- **An OpenAI API key** to transcribe recordings, write chapters and draw pictures. Without one, the app still runs: chapters get placeholder text and no pictures.
- **Optional: a Twilio Verify service** to text sign-in codes. Without it, the app runs in development mode and shows the code on screen.

## 1. Install

```bash
git clone https://github.com/discology/storybook-generator-3000.git
cd storybook-generator-3000
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Then fill in `.env`. Everything except `DATABASE_URL` is optional.

| Setting | What it does |
| --- | --- |
| `DATABASE_URL` | Where the SQLite database lives, relative to the `prisma` folder. The default creates `prisma/dev.db`. |
| `PORT` | Port for the API server (default 3002). The web app forwards `/api` and `/uploads` to it. |
| `OPENAI_API_KEY` | Turns on transcription, chapter writing, checks and pictures. |
| `OPENAI_MODEL` | The default model for the AI's text steps (default `gpt-5.5`). Each step can use its own model, chosen under Admin → Settings → AI instructions. |
| `OPENAI_TRANSCRIBE_MODEL` | Speech-to-text model (default `gpt-4o-transcribe`). |
| `OPENAI_IMAGE_INPUTS_PER_MIN` | How many reference images your OpenAI account may send per minute (default 5). Raise it when OpenAI raises your limit, and pictures are drawn faster. |
| `GEMINI_API_KEY` | Uses Google Gemini for transcription and the text steps when there's no OpenAI key. Pictures still need OpenAI. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Texts sign-in codes through Twilio Verify. |
| `APP_URL` | The app's public address, used in links inside messages (default `http://localhost:5174`). |
| `ADMIN_PHONES` | Phone numbers that can open the admin panel, comma-separated, like `+15551234567`. If it's empty, anyone signed in can open it, which is only safe on your own computer. |

`.env` is listed in `.gitignore`, so keys never end up in the repository.

## 3. Create the database

```bash
npx prisma migrate dev     # creates prisma/dev.db and the database client
npm run db:seed            # adds the four starter prompt cards
```

## 4. Run

```bash
npm run dev
```

This starts the web app on http://localhost:5174 and the API on http://localhost:3002. Both reload when you change code.

In VS Code, press **F5**. It starts the same two servers and opens Chrome at the app.

## 5. Sign in and start a storybook

1. Open http://localhost:5174 and choose **Start their story**.
2. Enter your mobile number. In development mode, the six-digit code appears on screen.
3. Set up the storybook in three steps: who it's for, how the stories read, and the reminder schedule.
4. Record a memory. On This week's chapter, choose **Make it now** to make a chapter right away instead of waiting for the weekly one.

The admin panel is at http://localhost:5174/admin. Put your number in `ADMIN_PHONES` first. The [admin guide](admin-guide.md) explains each part of it.

## Optional: import the Vambie characters

The Character Library can be filled from two sources. Both scripts skip what's already there, so they're safe to run again.

```bash
# Characters from the VOOT app's Character Bible (path to its database)
npm run characters:import-voot -- ../vambie-voot-ambassador/prisma/dev.db

# The official 3D renders (path to the folder of render ZIPs)
npm run characters:import-renders -- "path/to/Vambie 3D Pictures"
```

Without a path, the scripts look in `../vambie-voot-ambassador/prisma/dev.db` and in the Dropbox folder `Vambie 3D Pictures`. The VOOT import reads that database with Node's built-in SQLite module, which needs Node 22.13 or newer.

## Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Web app and API, reloading on changes |
| `npm run build` | Production build of the web app into `dist/` |
| `npm run db:studio` | Browse and edit the database in Prisma Studio |
| `npx tsc --noEmit` | Type-check the whole project |
| `npx prisma migrate dev --name <change>` | Create a migration after editing `prisma/schema.prisma` |

## Troubleshooting

- **npm says it skipped install scripts.** Newer versions of npm (11.19 and later) don't run packages' install scripts until you approve them. The app doesn't need them: `npx prisma migrate dev` creates the database client, and the build works without them.
- **"address already in use :::3002".** Another copy of the app is running, for example one started with F5 and another in a terminal. Stop one of them.
- **Pictures are slow, or the log says "rate limited".** Your OpenAI account limits how many reference images it accepts per minute. The app waits its turn and retries. When OpenAI raises your limit, raise `OPENAI_IMAGE_INPUTS_PER_MIN` to match.
- **The microphone is blocked.** Allow the microphone for the site in your browser's settings, then choose **Try microphone again**.
- **Testing on a phone.** Browsers only allow the microphone over HTTPS or on `localhost`. To record on a real phone, the app needs to be served over HTTPS, for example through a tunnel or a deployment.
- **Pictures say they didn't finish.** Pictures that were being drawn when the API restarted can't finish. Open the chapter's pages and choose **Try again**.
