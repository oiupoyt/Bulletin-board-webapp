# Bulletin Board Webapp

Personal project studying and building a lightweight announcement / syllabus / phase-test / answer-key board.
This repo is a sanitized, password-stripped copy of the app I run for my own college. It is **not** a deployment guide
and should not be treated as production-ready software — it's a personal project shared for reference only.

**Live preview:** [mod.oiupoyt.space](https://mod.oiupoyt.space)

## What it is

- Zero-framework Node.js + SQLite (`node:sqlite`) student bulletin.
- Announcements, weekly syllabus, phase tests, answer keys, web push notifications.
- Vanilla HTML/CSS/JS, no build step, Express 4, Multer.

## What was removed for public release

- No database, uploads, or user content — `data/` and `uploads/` are empty except `.gitkeep`.
- No credentials — every secret in `config.js`/`.env.example` is a placeholder; real push keys and hashes are not included.
- No institutional data — no exam papers, syllabi, or answer keys are included.

## Fresh clone quickstart (for inspection, not for deployment)

```bash
npm ci                  # or npm install
cp .env.example .env    # then fill it in — do not commit this file
npm run seed            # optional: sample announcements/syllabus
npm run dev             # watch mode, or: npm start
```

## Admin

- Login at `/login.html` after creating `.env`.
- Rotate the admin password:
  ```bash
  node scripts/hash-password.js "new-password"
  ```
  Paste the output `ADMIN_PASSWORD_HASH=...` line into `.env`.

## License

MIT (see `package.json`). Personal project — use at your own risk.
