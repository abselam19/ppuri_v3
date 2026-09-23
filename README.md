# 뿌리 (Ppuri) — Korean by roots

A self-hosted study app for the 5,698 words that the National Institute of Korean Language (NIKL) grades 초급 and 중급 (TOPIK levels 1–4). Hanja words are taught root first: you learn a root such as 학 (學, learning), then every word it completes, together with the roots it shares words with. Native words come in families (먹다 → 먹이, 먹이다, 먹히다), and verbs and adjectives come with generated conjugation tables and typing drills. Every word shows its romanized pronunciation.

It runs on your laptop with only Python. Optionally, it can also:
- send reminders and short lessons to your phone through Telegram or ntfy;
- run on your phone from GitHub Pages, with progress synced through your own GitHub account.

## Start

You need Python 3.8 or newer. No packages to install.

- **Windows:** double-click `start.bat`, or run `py serve.py` in this folder.
- **macOS:** double-click `start.command` (the first time, right-click → Open), or run `python3 serve.py`.
- **Linux:** `./start.sh` or `python3 serve.py`.

Your browser opens **http://127.0.0.1:8765**. Keep the terminal window open while you study and press Ctrl+C to stop.

Always use that exact address. The browser keeps progress per address, so `localhost:8765` would look like an empty app.

**Install it as an app (optional).** In Chrome or Edge, click the install icon at the right end of the address bar. The installed app opens in its own window and keeps working when the server is stopped. Start the server again when you want the laptop backups (below) to update.

**Pronunciation audio** uses your system's Korean voice.
- **Windows:** Settings → Time & language → Speech → Add voices → Korean.
- **macOS:** System Settings → Accessibility → Spoken Content → System voice → Manage Voices → Korean (Yuna).

Reload the app afterwards; the voice can be chosen in Settings.

## How studying works

**The path.** The study path has two stages, 초급 then 중급, and each stage mixes two kinds of units:

- **Root units:** one or more root cards, then the words those roots complete. Roots are chosen greedily so that each new root finishes as many frequent words as possible. A word is shown only when every root in it has been introduced. Hanja that occur in just one target word get no root card; they are explained on the word.
- **Native units:**
  - word families (a base word and the target words derived from it);
  - small batches of everyday native words and loanwords, in frequency order.

In stage 2, about 1,200 중급 words need no new roots at all; they arrive as "revisit" units under a root you already know.

**Cards.**

| Card | Front | Notes |
|---|---|---|
| Root | the root's Hangul reading in a practice square, with its romanization and two words it builds | back shows the Korean meaning (훈), an English gloss, the roots that sound the same, and a map of its words and co-parent roots |
| Word | the word in manuscript cells, romanization above each syllable | when you know all its roots, their meanings appear under the cells as a hint: decode the word |
| Conjugation | a verb or adjective and a target form | type the form in Korean; the answer is checked for you |
| English → Korean | English meaning and syllable count | off by default (Settings) |

Conjugation and English→Korean cards start only after the word itself has passed its learning steps. They have their own daily allowance: a quarter of the new-card limit.

**Keys.**

| Key | Action |
|---|---|
| Space | show the answer, or rate the card Good |
| Enter | check a conjugation answer, then accept the suggested rating |
| 1 2 3 4 | rate Again, Hard, Good, Easy |
| S | play the pronunciation |
| Z | undo the last answer |
| Esc | leave the session |

**Romanization.** Settings → Display → "Above Korean words" chooses what sits above each syllable: Romanization (the default), Hanja, or Both.
- Romanization follows the Revised Romanization of Korean and is based on the standard pronunciation, taken from the dictionary for 5,364 of the 5,698 words and derived by rule for the rest and for conjugated forms.
- As the official system does, it ignores tensification: 학생 [학쌩] is *haksaeng*. Word pages also show the pronunciation in Hangul, e.g. "pronounced [학쌩]".
- Conjugation tables and drill answers are romanized too (먹었어요, *meogeosseoyo*), and search accepts romanization (*haksaeng*).

**Maps and co-parent roots.** Each root page opens on a root map with three parts:
- the root in the hub;
- its words fanning out, with the root's syllable in red;
- on the right, the other roots each word is built from, its **co-parent roots**.

A ×n badge marks a co-parent that joins n of the shown words. Learning those pairs together unlocks several words at once: 학 and 생 together give 학생, 대학생, 유학생 and more. Point at a word or a co-parent to trace its lines, and click a co-parent to open its own map. Word pages and word cards show the word between its co-parent roots, surrounded by other words each root builds. Maps show Hangul, romanization and English.

**Same-sounding roots.** Most roots share their reading with another root: 779 of the 903, and 262 of the first 300 on the path. So root pages and root cards list the other roots with the same reading, each named by one of your own words: 대 as in 대화 (face, oppose), 대 as in 대표 (replace; era), 대 as in 침대 (stand, platform). Words spelled alike but built from different roots, such as 시장 (market) and 시장 (mayor), link to each other on their word pages. This is the main pitfall of learning Sino-Korean roots without hanja on screen. For the same reason, a root card names its root on the front by two of its words (시 as in 역시, 혹시): ten roots are read 시, so the reading alone would not say which one the card asks about.

**Scheduling.** Reviews are scheduled with FSRS (the algorithm Anki also offers), aiming at 90% recall by default. The study day rolls over at 4 a.m.

**Placement check.** Use the placement check first if you already know some Korean. Words you mark as known skip the learning steps and come back for a check two to eight weeks later.

**Load.** The full path is about 6,600 new cards (5,698 words + 903 roots):

| New cards a day | Time for the full path |
|---|---|
| 20 | about 11 months |
| 25 | about 9 months |

The placement check shortens this by removing words you already know.

## Reminders on your phone

While `serve.py` runs, it can message your phone at the times you choose. Each reminder shows:
- the reviews and new cards waiting;
- your streak;
- the next roots on your path, with their words, romanization and meanings.

On Windows, type `py` instead of `python3` in the commands below. Run them in this folder; on Windows, you can type `cmd` in File Explorer's address bar to open a terminal there.

### Telegram (recommended)

1. In Telegram, open a chat with **@BotFather**, send `/newbot`, and pick a name. BotFather replies with a token.
2. Run `python3 serve.py --setup telegram`, then:
   - paste the token;
   - when asked, open the link to your bot on your phone and press **Start**;
   - choose reminder times (default 08:30 and 21:00);
   - optionally, add the app's address from GitHub Pages (below). Reminders then get an **Open 뿌리** button.
3. Start the app as usual. The terminal shows `Phone reminders via Telegram at …`. To test, run `python3 serve.py --send-reminder`.

You can also talk to the bot:

| Message | Answer |
|---|---|
| `/today` | what is waiting today, streak, and the next roots and words |
| `/next` | the next unit on your path |
| `/quiz` | a practice card from words you have started; tap **Show answer**, then **Next word** |
| `/word 학생` | a word's meanings, romanization, pronunciation, roots and example. You can also send just the word, or its romanization |
| `/root 학` | a root, its co-parent roots with ×n counts, and the words they build together |
| `/remind 08:30 21:00` | new reminder times; `/remind off` pauses reminders and `/remind on` resumes them |

- **Private:** the bot answers only the chat you connected during setup.
- **Practice only:** Telegram practice does not change your review schedule; the real reviews happen in the app.

### ntfy (simpler, notifications only)

1. Install the ntfy app on your phone.
2. Run `python3 serve.py --setup ntfy` and keep the suggested random topic name.
3. In the ntfy app, subscribe to that topic.

Anyone who knows the topic name can read the notifications. ntfy cannot answer commands.

### Keeping it running

Reminders need `serve.py` running and the laptop awake.

**Keep the laptop awake.**
- **Windows:** Settings → System → Power & battery → Screen, sleep & hibernate timeouts → "Make my device sleep after": Never (plugged in). To start the app with Windows, press Win+R, type `shell:startup`, and put a shortcut to `start.bat` in the folder that opens.
- **macOS:** System Settings → Battery → Options → turn on "Prevent automatic sleeping on power adapter when the display is off". Or run `caffeinate -s python3 serve.py`.
- **Linux:** `systemd-inhibit python3 serve.py --no-browser`.

**Missed reminders.** If the laptop was asleep or offline at a reminder time, the reminder is sent once it wakes. If several were missed, only the latest is sent. Failed sends are retried every five minutes.

**Your tokens.** Tokens and chat ids are stored in `config.json` in this folder (readable only by you on macOS and Linux). Never share or commit that file; `.gitignore` already excludes it. Start with `--no-reminders` to run the app without the bot.

## Use it on your phone: GitHub Pages and sync

### Publish the app

The app is a static site, so GitHub Pages can host it. The repository includes a workflow (`.github/workflows/pages.yml`) that runs the tests, builds the app and publishes it on every push to `main`.

1. Create a repository on GitHub, for example `ppuri`. With a free account it must be public; the published site is public in any case.
2. Push this folder:
   ```
   git init
   git add .
   git commit -m "뿌리"
   git branch -M main
   git remote add origin https://github.com/<you>/ppuri.git
   git push -u origin main
   ```
   `config.json`, `progress/` and the built `app/dist/` are not pushed. The word list `app/public/data/ppuri-data.json` is pushed, because the build needs it.
3. In the repository, open Settings → Pages → Build and deployment and set Source to **GitHub Actions**. The Actions tab shows the "Publish to GitHub Pages" run.
4. The app appears at `https://<you>.github.io/ppuri/`. On the phone, open it and add it to the home screen:
   - **iPhone (Safari):** Share → Add to Home Screen;
   - **Android (Chrome):** menu → Install app.

The published site holds only the app and the word list, with the word list's license file (`data/LICENSE.md`). Your progress stays on your devices and in your sync file. The laptop backup section of Settings appears only when the app runs from `serve.py`.

### Sync your progress

Each browser keeps its own progress. To share progress between devices, the app keeps a sync file in a secret gist in your GitHub account.

1. **Create a token.** On github.com, open Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic). Tick only **gist**, choose an expiry, and copy the token.
2. **First device** (e.g. the laptop app at http://127.0.0.1:8765): open Settings → "Sync between phone and laptop", paste the token, leave the sync code empty, and click **Connect**. The app creates the sync file and shows its **sync code**.
3. **Each other device:** in the same place, paste the same token and that sync code, then click **Connect**.
4. **Count phone reviews in reminders:** run `python3 serve.py --setup sync` with the same token and sync code. Otherwise the reminders use the laptop backup, which includes phone reviews only after the laptop app has synced.

**When it syncs:** when the app opens or comes back to the foreground, about a minute after you study, when you leave a session, and whenever you press **Sync now**.

**What is merged:**
- For each card, the most recently reviewed version wins.
- The review history of the last 120 days is shared.
- Settings are shared, except the voice.

Things to know:
- **The sync file is secret, not private.** A secret gist is unlisted: anyone who has its address can read it. It holds only card states and review times.
- **Lost phone:** the token can edit your gists. If you lose the phone, revoke the token on GitHub and make a new one.
- **Starting over:** "Delete all progress" affects one device, and with sync on the progress comes back from the sync file. To start over everywhere, first stop syncing on each device and delete the gist on GitHub.

## Your progress and backups

- **In the browser:** progress lives in the browser's own storage (IndexedDB) for the address you use.
- **On the laptop:** while `serve.py` runs, the app also saves a full copy into the `progress/` folder. A copy is saved about 90 seconds after you study, when you leave a session, and when you switch away from the tab.
  - `progress/latest.json` is always the newest copy.
  - The 20 most recent copies are kept, plus the last copy of each day for 60 days.
- **In the sync file:** if sync is on, the gist holds another copy (cards and the last 120 days of reviews).
- **Manual backups:** Settings → Backups lets you back up now, download a backup file, restore from a file, or restore the latest laptop copy.
- If you clear your browser data or switch browsers, open the app and use **Restore it** on the first screen (or Settings → Restore laptop backup). With sync on, connecting again restores it too.

## Updating the word list (optional)

The included word list was built from a 2019 snapshot of NIKL's 한국어기초사전 (Basic Korean Dictionary). The build report is in `pipeline/report.txt`. It lists hanja alignment warnings and every native word family the rules found.

To rebuild it:

```
cd pipeline
pip install wordfreq            # optional; orders the path by word frequency
python fetch_sources.py         # about 360 MB: dictionary mirror + hanja tables
python build_data.py --krdict sources/krdict --hanja sources/hanja.txt --unihan sources/kDefinition.txt
```

For the newest dictionary (NIKL posted a full download in December 2025):

1. Download it from https://krdict.korean.go.kr → 사전 내려받기, in XML format, and unzip it into a folder.
2. Run `python fetch_sources.py --no-dict` to get only the hanja tables.
3. Run `build_data.py` with `--krdict <that folder>`.

The parser was written against the 2019 files (LMF XML, DTD revision 16). If the new download is laid out differently, `load_krdict()` in `build_data.py` is the one function to adapt.

`build_data.py` writes the new list into both `app/public/data/` and `app/dist/data/`, so the running app uses it after a reload; Node.js is not needed. Your progress carries over, because cards are keyed by dictionary entry id and by hanja. Push the new `app/public/data/ppuri-data.json` to update the GitHub Pages copy.

Two tables in `build_data.py` are hand-written and worth checking:

- `GLOSS_OVERRIDES`: English meanings for 106 roots, written by hand. The Unicode source describes Chinese usage, which is often wrong for Korean words: it glosses 以 as "by means of" where your words (이상, 이후, 이전) use it as a reference point, and 空 as "empty" where 공항 and 항공 use it as "sky, air". The roots on the first stretch of the path have been reviewed; later ones have not.
- `BLOCK`: pairs the derivation rules would otherwise link wrongly (기르다/기름, 안다/안개).

## Changing the app (optional)

With Node.js 20 or newer:

```
cd app
npm install
npm test          # conjugation engine and dictionary-wide check, romanization, sync merging
npm run dev       # live-reloading dev server; run serve.py as well if you want backups
npm run build     # writes app/dist, which serve.py serves
```

The Python parts have their own tests, which need no packages:

```
python -m unittest discover -s server/tests -t .       # Telegram bot, reminders, ntfy, sync file (against a fake API)
cd pipeline && python -m unittest test_romanize        # the same romanization cases as the app
```

The conjugation engine matches 3,554 of the dictionary's 3,557 printed conjugation samples. The three misses are an archaic imperative (마오) and two dictionary entries whose sample fields hold pronunciations instead of spellings.

```
serve.py                  local server, backup API, phone reminders (standard library only)
server/core.py            config, word list, progress snapshots, daily plan, message texts
server/channels.py        Telegram bot, ntfy, reminder clock, guided setup
app/src/lib/conjugate.ts  conjugation engine: irregular classes, form tables, drills
app/src/lib/roman.ts      Revised Romanization with pronunciation rules
app/src/lib/sync.ts       sync through a GitHub gist
app/src/lib/session.ts    daily plan: due reviews, next path units, follow-up cards
app/src/lib/srs.ts        FSRS wrapper (ts-fsrs)
app/src/lib/store.ts      IndexedDB storage, backups, settings
app/src/components/       manuscript cells, root and word maps, word details
app/src/views/            Today, Study, Roots, Words, Placement, Settings
app/tests/                engine, romanization (roman-cases.json) and sync tests
pipeline/build_data.py    dictionary → word list, roots, families, study path, pronunciation
pipeline/romanize.py      the Python twin of roman.ts
.github/workflows/        GitHub Pages publishing
```

## Sources and licenses

- **Vocabulary, definitions, pronunciations, examples and conjugation samples:** 국립국어원 한국어기초사전, licensed CC BY-SA 2.0 KR.
  - The generated word list (`ppuri-data.json`) is derived from it and falls under the same license. The notice is in `app/public/data/LICENSE.md` and is published together with the app. If you share the list, credit NIKL and share it under the same terms.
- **Hanja readings and Korean meanings:** libhangul `hanja.txt` (BSD-3-Clause).
- **English hanja definitions:** Unicode Unihan database (Unicode License v3). It describes Chinese usage, so root pages label it "In Chinese dictionaries" and show a hand-checked Korean meaning first.
- **Word frequencies, used only to order the path:** wordfreq data (CC BY-SA 4.0).
- **Libraries and font:** ts-fsrs (MIT), React (MIT), idb (ISC), Literata font (SIL Open Font License 1.1).
- **Audio:** the dictionary's pronunciation recordings are not used. The mirror's maintainers were told they may not be redistributed, so the app relies on your system's Korean voice.
- **Services you connect yourself:** Telegram, ntfy and GitHub each have their own terms. The app only talks to them when you set them up.
