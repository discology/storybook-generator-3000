# Deployment

The app is hosted on [Fly.io](https://fly.io) at **https://vambie-storybook.fly.dev**.

## How it's set up

| Part | Setup |
| --- | --- |
| App | `vambie-storybook`, in the `sjc` region (San Jose) |
| Machine | One machine with a shared CPU and 1 GB of memory. SQLite allows only one machine at a time. It never sleeps, because weekly chapters and picture drawing run inside the app. |
| Disk | The `vambie_data` volume (3 GB, encrypted), mounted at `/data`. It holds the database (`/data/storybook.db`) and every saved file (`/data/uploads`). |
| Backups | Fly takes a snapshot of the disk every day and keeps the last 5. |
| Address | HTTPS at `vambie-storybook.fly.dev`. Plain HTTP is redirected to HTTPS. |
| Sign-up | Open: anyone can sign up and start a storybook (`OPEN_SIGNUP=on`) |
| Cost | About $6 a month for the machine and disk, plus OpenAI and Twilio usage |

The [Dockerfile](../Dockerfile) installs the dependencies and builds the web app and the database client. When the machine starts, [deploy/start.sh](../deploy/start.sh):

1. imports `/data/import.tgz` if it's there (see [Copying data to the server](#copying-data-to-the-server));
2. points the app's `uploads` folder at the volume;
3. applies any new database migrations;
4. starts the server, which also serves the web app.

## What's different from development

The server runs with `NODE_ENV=production`, which changes a few things:

- **Sign-in codes are only texted,** through Twilio Verify. The development mode that shows the code on screen is off, because it would let anyone sign in as anyone.
- **The admin panel is closed** unless your number is in `ADMIN_PHONES`.
- **Starting a storybook is invite-only by default,** so strangers can't run up AI costs. Admins and the numbers in `ALLOWED_PHONES` can start one. Everyone else joins a family through an invitation link, and sees "Vambie is invite-only for now" if they try to start their own. `OPEN_SIGNUP=on` lets anyone start a storybook; the hosted app has it on. To go back to invite-only, run `fly secrets unset OPEN_SIGNUP`.
- **Weekly chapters are made here.** A development copy only makes them with `WEEKLY_CHAPTERS=on`, so the hosted app and a local copy never both spend money on the same chapter.
- **Session cookies are HTTPS-only,** and the server sends basic security headers.

## Settings

Secret settings are stored with Fly and never in the repository:

| Setting | Value |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI key for transcription, writing, checks and pictures |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify, for texting sign-in codes |
| `ADMIN_PHONES` | Phone numbers that can open the admin panel |
| `ALLOWED_PHONES` | Optional: more phone numbers allowed to start a storybook |
| `OPEN_SIGNUP` | Optional: `on` lets anyone start a storybook |
| `TWILIO_MESSAGING_SERVICE_SID` | Optional: the Twilio Messaging Service that sends the app's texts. Without it, nothing is texted except sign-in codes |
| `TEXTS_MODE` | Optional: `live` texts everyone who verified their number. Anything else is test mode: only `ADMIN_PHONES` and `TEXT_TEST_PHONES` get texts |
| `TEXT_TEST_PHONES` | Optional: more phone numbers that get texts in test mode |
| `JIRA_SITE`, `JIRA_EMAIL`, `JIRA_API_TOKEN` | Optional: lets Admin → Feedback send action items to Jira (site like `discologyinc.atlassian.net`; an Atlassian API token from id.atlassian.com → Security → API tokens). `JIRA_PROJECT` defaults to `VSB` |

Non-secret settings live in [fly.toml](../fly.toml) (`APP_URL`) and the [Dockerfile](../Dockerfile) (`NODE_ENV`, `PORT`, `DATABASE_URL`).

To change a secret, run this from the project folder. Saving it restarts the app.

```bash
fly secrets set ALLOWED_PHONES="+15551234567,+15557654321"
```

`fly secrets list` shows which secrets are set, without their values.

## Deploying a new version

From the project folder:

```bash
fly deploy
```

Fly builds the app on its own servers, so Docker isn't needed locally. A deploy takes about 3–6 minutes. Because there's only one machine, the app is unavailable for about half a minute while it restarts. Pictures that were being drawn at that moment are marked as unfinished, and the parent can retry them from the chapter's pages.

## Everyday commands

All of these are run from the project folder. On the development Mac, `fly` (and GitHub's `gh`) are installed in `~/.local/bin`.

| Command | What it does |
| --- | --- |
| `fly status` | Shows whether the machine is running |
| `fly logs` | Streams the server's log |
| `fly ssh console` | Opens a shell on the machine |
| `fly volumes list` | Shows the disk and its size |
| `fly volumes extend <volume id> --size 6` | Grows the disk to 6 GB, without downtime |
| `fly volumes snapshots list <volume id>` | Lists the daily backups |

## Copying data to the server

This replaces the server's database and every saved file. It's how the first copy of the data was moved from a Mac.

1. Make a consistent copy of the database and pack it with the uploads, in a folder outside the project:

   ```bash
   mkdir -p /tmp/vambie-import
   sqlite3 prisma/dev.db ".backup '/tmp/vambie-import/storybook.db'"
   sqlite3 /tmp/vambie-import/storybook.db "delete from Session; delete from OtpCode;"
   COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -czf /tmp/vambie-import/import.tgz \
     -C /tmp/vambie-import storybook.db -C "$PWD" uploads
   ```

   Clearing the sessions means everyone signs in again on the server.

2. Upload the archive to the disk:

   ```bash
   fly ssh sftp shell
   » put /tmp/vambie-import/import.tgz /data/import.tgz
   ```

3. Restart the machine (`fly status` shows its ID). The start script imports the archive, then deletes it.

   ```bash
   fly machine restart <machine id>
   ```

## Restoring a backup

To get a copy of the database:

```bash
fly ssh sftp get /data/storybook.db
```

To roll the whole disk back, restore a daily snapshot into a new volume and move the machine onto it, following Fly's guide to [volume snapshots](https://fly.io/docs/volumes/snapshots/). Snapshots are kept for 5 days, and `fly volumes snapshots list <volume id>` shows them.
