# Perfectly

Starter project **React + Vite** untuk workspace AI coding Perfectly, berdasarkan HTML referensi dan icon yang kamu unggah.

## Fitur

- Landing page responsive, mobile-first, animasi ringan, dan tampilan monokrom.
- Login dan sign up email/password, Google OAuth, dan GitHub OAuth.
- Autentikasi, akun, session, dan riwayat chat disimpan di **Neon PostgreSQL**.
- Password email disimpan sebagai hash `scrypt`; session memakai token acak yang disimpan dalam bentuk SHA-256 hash dan cookie `HttpOnly`.
- Workspace `/app` dengan chat bubble user/AI, Markdown, loading indicator, riwayat percakapan lintas perangkat, logout, dan pemilih model.
- Upload gambar PNG/JPG/WEBP/GIF serta file teks/kode seperti TXT, MD, JSON, CSV, JS/TS, HTML, CSS, Python, Java, Go, Rust, SQL, LOG, YAML, XML, dan SH.
- Backend serverless Vercel di `/api/auth`, `/api/auth/callback/*`, `/api/chat`, `/api/chats`, dan `/api/health`.
- Integrasi Ollama Cloud untuk Beam dan Gemma 4, OpenAI API untuk GPT, serta Anthropic API untuk Claude.
- API key database dan AI hanya dibaca di backend. Tidak ada secret yang dikirim ke browser.

## 1. Instalasi dan development

```bash
npm install
cp .env.example .env.local
```

Di Windows PowerShell, gunakan `Copy-Item .env.example .env.local`.

Frontend Vite saja:

```bash
npm run dev
```

Frontend + Vercel serverless API:

```bash
npm run dev:vercel
```

Build frontend:

```bash
npm run build
```

Gunakan `npm run dev:vercel` untuk menguji login, riwayat chat, dan endpoint API lokal. Vite dev server biasa tidak menjalankan file function pada folder `api/`.

## 2. Menyiapkan Neon PostgreSQL

1. Buat project di [Neon Console](https://console.neon.tech/).
2. Pilih database dan role yang akan dipakai aplikasi.
3. Klik **Connect**, pilih branch/database/role, lalu salin connection string. Untuk Vercel gunakan pooled connection string bila tersedia.
4. Masukkan connection string sebagai `DATABASE_URL` di `.env.local` dan Vercel → Project → Settings → Environment Variables.
5. Jangan memberi prefix `VITE_` pada `DATABASE_URL` dan jangan commit file `.env.local`.

Contoh format (bukan kredensial sungguhan):

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

Tabel dibuat otomatis ketika API pertama kali dipanggil. Bila ingin membuatnya manual, buka Neon SQL Editor dan jalankan isi file `neon-schema.sql` di root project. Skema ini membuat:

- `perfectly_users` — akun email, password hash, dan profil.
- `perfectly_oauth_accounts` — identitas Google/GitHub yang terhubung ke akun.
- `perfectly_sessions` — session login yang memiliki masa berlaku 30 hari.
- `perfectly_conversations` — riwayat chat dalam kolom JSONB, terikat ke pemilik akun.

Riwayat chat dipisahkan berdasarkan `user_id`, jadi satu akun tidak dapat membaca percakapan akun lain melalui API.

## 3. Email/password authentication

Tidak perlu layanan auth eksternal. Endpoint backend menangani registrasi dan login. Password minimal 8 dan maksimal 128 karakter, di-hash dengan Node.js `scrypt`, lalu session token acak disimpan dalam bentuk hash di Neon. Browser hanya menerima cookie `HttpOnly`, `SameSite=Lax`, dan `Secure` saat berjalan melalui HTTPS.

**Catatan:** versi ini belum mengirim email verifikasi atau reset password. Untuk production publik, tambahkan layanan email/transaksi untuk verifikasi email dan pemulihan password sebelum membuka pendaftaran luas.

## 4. Google OAuth

1. Buat OAuth Client ID tipe **Web application** di [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Tambahkan Authorized redirect URI persis seperti berikut:
   - `https://YOUR-DOMAIN/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` untuk pengujian lokal opsional.
3. Tambahkan `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` ke `.env.local` dan environment Vercel.
4. Scope yang diminta aplikasi: `openid email profile`.

Google mensyaratkan redirect URI sama persis dengan yang terdaftar. Sesuaikan domain jika menggunakan custom domain.

## 5. GitHub OAuth

1. Buka GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.
2. Isi Homepage URL dengan domain aplikasi.
3. Isi Authorization callback URL dengan URL persis berikut:
   - `https://YOUR-DOMAIN/api/auth/callback/github`
   - `http://localhost:3000/api/auth/callback/github` untuk pengujian lokal opsional.
4. Masukkan `GITHUB_CLIENT_ID` dan `GITHUB_CLIENT_SECRET` ke `.env.local` dan Vercel.
5. Aplikasi meminta scope `read:user` dan `user:email`; akun GitHub harus memiliki email terverifikasi.

Jangan menaruh client secret Google/GitHub di variable `VITE_` atau source code frontend.

## 6. APP_URL dan callback

Atur `APP_URL` ke origin final, tanpa slash di akhir, misalnya:

```env
APP_URL=https://YOUR-DOMAIN
```

Untuk deployment Vercel, sebaiknya isi variable ini secara eksplisit agar callback OAuth selalu menggunakan domain yang benar. Untuk development lokal dengan `vercel dev`, gunakan `http://localhost:3000`.

## 7. Menyiapkan API key AI

Tambahkan API key sebagai environment variable server-side:

| Pilihan model di UI | Provider | Model ID default | Environment variable |
|---|---|---|---|
| Beam | Ollama Cloud | `beam` | `OLLAMA_API_KEY` |
| Gemma 4 | Ollama Cloud | `gemma4:31b` | `OLLAMA_API_KEY` |
| GPT 6 Luna | OpenAI | `gpt-6-luna` | `OPENAI_API_KEY` |
| GPT 6 Astra | OpenAI | `gpt-6-astra` | `OPENAI_API_KEY` |
| Claude Sonnet 5.5 | Anthropic | `claude-sonnet-5-5` | `ANTHROPIC_API_KEY` |
| Claude Opus 5.5 | Anthropic | `claude-opus-5-5` | `ANTHROPIC_API_KEY` |

- **Ollama Cloud:** backend memanggil `https://ollama.com/api/chat`.
- **OpenAI:** backend menggunakan `https://api.openai.com/v1/responses`.
- **Anthropic:** backend menggunakan `https://api.anthropic.com/v1/messages`.

Langganan ChatGPT bukan API key OpenAI Platform. Langganan Claude Pro/Max juga bukan API key Anthropic; penggunaan API diatur dan ditagih terpisah.

Model ID dapat disesuaikan melalui override opsional di `.env.example`.

## 8. Deploy ke Vercel

1. Push folder project ini ke GitHub atau import repository ke Vercel.
2. Framework Preset: **Vite**.
3. Build Command: `npm run build`.
4. Output Directory: `dist`.
5. Tambahkan environment variables berikut:
   - `DATABASE_URL`
   - `APP_URL`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - `OLLAMA_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
   - Model ID override bila diperlukan.
6. Pastikan callback URI pada Google dan GitHub menggunakan domain deployment yang sama dengan `APP_URL`.
7. Deploy/redeploy setelah environment variable ditambahkan.

Vercel menjalankan function dari folder `api/`. `vercel.json` mengatur durasi function dan fallback SPA ke `index.html`.

## 9. Database health check

Buka `/api/health` pada deployment. Response menampilkan status koneksi Neon, status konfigurasi provider AI, dan daftar model. Response tidak pernah mengembalikan nilai connection string atau API key.

## Batasan versi ini

- Belum tersedia verifikasi email, reset password, MFA, dan rate limiting khusus login. Tambahkan mekanisme tersebut sebelum membuka layanan untuk penggunaan publik berskala besar.
- Riwayat chat disimpan di Neon dan dapat dimuat lintas browser/perangkat setelah login.
- Lampiran gambar hanya dikirim ke provider AI ketika request berlangsung; riwayat database hanya menyimpan nama dan tipe lampiran, bukan binary gambar.
- PDF parsing, impor repository, akses shell/terminal, operasi Git, dan pengubahan file otomatis belum tersedia. Assistant tidak boleh dianggap telah menjalankan command atau mengubah repository.
- Belum ada sistem paket berbayar / PRO.
- Gambar dibatasi maksimal 1,5 MB per file dan total 1,5 MB per pesan. Format yang diterima: PNG, JPG, WEBP, GIF. File teks/kode dibatasi 80.000 karakter per file.

## Pemeriksaan

```bash
npm run build
npm run lint
```

Hasil build dibuat di `dist/`.
