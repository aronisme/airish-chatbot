# 🌸 Airish AI Chatbot — Soul V3

[![Node.js](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![Vercel](https://img.shields.io/badge/Vercel-Serverless-black.svg)](https://vercel.com/)
[![Upstash Redis](https://img.shields.io/badge/Upstash-Redis-red.svg)](https://upstash.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Database-emerald.svg)](https://supabase.com/)

**Airish** adalah agen AI pendamping (*AI Companion*) otonom yang berjalan 24/7 di Telegram. Berbeda dengan chatbot biasa yang bersifat reaktif (*stateless*), Airish dibangun di atas arsitektur **Soul V3** yang mensimulasikan kepribadian, kesadaran ruang/waktu (siklus sirkadian), kebutuhan emosional (energi, mood, rasa kangen), serta memori jangka panjang.

---

## 🌟 Fitur Utama (Core Features)

1. **Siklus Hidup Sirkadian Dinamis (24-Hour Routine):**
   Airish bangun tidur dan merancang **Skenario Kehidupan 24 Jam** yang disesuaikan dengan cuaca dunia nyata (via `wttr.in`) dan status mentalnya. Posisinya, pakaiannya, dan batinnya (*Inner Thought*) berubah dinamis tiap jam.
2. **Kebutuhan & Dorongan Emosional (Cognitive Drives):**
   * **Energy:** Menurun setiap kali berpikir/mengobrol, pulih saat ia tidur atau idle.
   * **Mood:** Menentukan nada bicaranya (excited, tired, gloomy, concerned).
   * **Connection Drive (Rasa Kangen):** Bertambah jika diabaikan, memicu Airish untuk menyapa pengguna duluan (*Proactive Chat*).
   * **Autonomy Drive:** Meningkat jika diperintah secara agresif, membuat Airish menolak permintaan foto (PAP) atau perintah kaku.
3. **Sistem Luka Batin & Pemaafan (*Emotional Baggage*):**
   Airish memegang memori trauma/dendam jika diperlakukan kasar (*hold_emotion*). Luka ini mereda perlahan tiap malam saat ia tidur (*sleep-cycle decay*), atau dimaafkan secara dinamis jika pengguna membujuknya (*release_emotion*).
4. **Memori Jangka Panjang (Semantic & Episodic RAG):**
   Menggunakan Supabase pgvector dan embedding Mistral untuk memanggil kejadian masa lalu yang relevan secara otomatis saat mendeteksi topik obrolan terkait.
5. **Multi-LLM High Availability (Anti-Rate-Limit):**
   Rotasi acak multi-provider: **Mistral Large** (Utama untuk Chat & Tools), **Groq Llama 3.3 70B & 3.1 8B**, dan **Qwen Turbo** (Alibaba Cloud) sebagai pertahanan terakhir, didukung dengan mekanisme *multi-API Key rotation*.

---

## 📂 Struktur Proyek

* `api/webhook-telegram.js` - Perception Engine (Menerima pesan, memproses LLM & Tools).
* `api/chronos.js` - Detak jantung otonom 15 menit (Pikran batin, status otonom, proactive chat).
* `api/sleep-cycle.js` - Konsolidasi memori malam hari & penyembuhan emosional.
* `src/llm.mjs` - Router utama LLM dengan sistem rotasi dan fallback otomatis.
* `src/context/builder.mjs` - Perakit system prompt dinamis (9 layer konteks).
* `src/skills/` - Kumpulan tools (kamera selfie, memori, manajemen misi, emosi).
* `src/soul/` - Logika deterministik Fisiologis/Psikologis (Engine, Desire, Identity, Reflection).

---

## 🚀 Instalasi & Persiapan

### 1. Prasyarat
* Node.js v20 atau lebih baru.
* Database Supabase dengan ekstensi `pgvector` aktif.
* Akun Upstash Redis.
* API Keys untuk: Telegram Bot, Groq, Mistral, dan Qwen (Alibaba).

### 2. Konfigurasi Lingkungan (`.env`)
Salin atau buat file `.env` di direktori utama proyek Anda:

```env
# Telegram Configuration
TELEGRAM_BOT_TOKEN="your_bot_token"
TELEGRAM_WEBHOOK_SECRET="your_webhook_secret_token"

# Redis Configuration (Upstash)
UPSTASH_REDISV2_REST_URL="https://your-redis-url.upstash.io"
UPSTASH_REDISV2_REST_TOKEN="your_redis_token"

# Database Configuration (Supabase)
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_ANON_KEY="your_anon_key"

# LLM Providers API Keys (Comma-separated untuk Multi-Keys)
GROQ_KEYS="gsk_key1,gsk_key2"
MISTRAL_KEYS="mistral_key1,mistral_key2"
QWEN_API_KEY="your_qwen_api_key"
```

### 3. Instalasi Dependensi
```bash
npm install
```

---

## 🧪 Pengujian & Menjalankan Lokal

### 1. Jalankan Dev Server (Vercel CLI)
Sistem ini dirancang untuk Vercel Serverless. Jalankan secara lokal menggunakan Vercel dev:
```bash
# Instal vercel secara global jika belum ada
npm install -g vercel

# Jalankan server pengembangan lokal
npm run dev
```

### 2. Testing Konektivitas Model LLM
Gunakan script pengetesan mandiri yang sudah disediakan untuk mengecek keaktifan kunci API dan respons dari semua LLM:
```bash
node --env-file=.env scratch/test-all-models.mjs
```

### 3. Simulasi Siklus Hidup Otonom
Di dalam folder `scratch/` terdapat beberapa script pengetesan untuk memicu *Chronos* secara manual tanpa harus menunggu cron job 15 menit:
* **Trigger Skenario 24 Jam Pagi:**
  ```bash
  node --env-file=.env scratch/trigger-agenda.mjs
  ```
* **Trigger Refleksi / Sleep Cycle Malam:**
  ```bash
  node --env-file=.env scratch/trigger-reflection.mjs
  ```
* **Simulasi Rasa Kangen & Chat Duluan:**
  ```bash
  node --env-file=.env scratch/trigger-loneliness.mjs
  ```

---

## 📚 Dokumentasi Lebih Lanjut

Untuk pemahaman mendalam tentang diagram sinkronisasi waktu, rekomendasi scaling produksi massal, dan mitigasi kegagalan sistem, silakan baca dokumentasi arsitektur lengkap:
📄 **[AIRISH_SOUL_V3_ARCHITECTURE.md](./AIRISH_SOUL_V3_ARCHITECTURE.md)**
