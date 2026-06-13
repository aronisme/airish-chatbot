# 🧠 Airish Soul V3 — Complete System Architecture

> Dokumentasi teknis lengkap untuk pengembang. Terakhir diperbarui: 2026-06-13.

---

## 1. Gambaran Umum

Airish adalah **AI Companion otonom** yang berjalan 24/7 di Telegram. Bukan chatbot biasa — ia memiliki:
- Siklus tidur-bangun dinamis
- Lokasi fisik & pakaian yang berubah tiap jam
- Emosi, dendam, dan mekanisme memaafkan
- Memori jangka pendek & panjang (termasuk RAG/vector search)
- Proactive chat (chat duluan kalau kangen)

**Tech Stack:** Node.js (ESM) · Vercel Serverless · Upstash Redis · Supabase (PostgreSQL + pgvector) · Multi-LLM (Mistral, Groq, Qwen/Alibaba)

---

## 2. Struktur Direktori

```
airish-chatbot/
├── api/                          # Vercel Serverless Functions (Entry Points)
│   ├── webhook-telegram.js       # [PILAR 1] Perception Engine — menerima chat user
│   ├── chronos.js                # [PILAR 2] Chronos Engine — detak jantung otonom (tiap 15 menit)
│   ├── sleep-cycle.js            # [PILAR 3] Sleep Cycle — konsolidasi memori & healing
│   └── soul-settings.js          # API untuk Dashboard (baca/tulis pengaturan)
├── src/
│   ├── llm.mjs                   # Multi-LLM Router (Mistral, Groq, Qwen) + Multi-Key + Rotation
│   ├── redis.mjs                 # Koneksi Upstash Redis
│   ├── http.mjs                  # Helper HTTP untuk Vercel handler
│   ├── context/
│   │   └── builder.mjs           # Perakit System Prompt raksasa
│   ├── memory/
│   │   ├── working.mjs           # Short-Term Memory (Redis List, maks 20 pesan)
│   │   ├── semantic.mjs          # Long-Term Facts (Supabase `memories` table)
│   │   └── episodic.mjs          # Episodic Memory + RAG via pgvector + Mistral Embedding
│   ├── perception/
│   │   └── parser.mjs            # Analisis intent/emosi/hostility user (Groq, JSON mode)
│   ├── skills/                   # AI Tool Definitions & Executors
│   │   ├── index.mjs             # Registry & Router semua tools
│   │   ├── photo.mjs             # generate_photo — Selfie/PAP via Qwen Image
│   │   ├── memory.mjs            # save_memory — Simpan fakta user ke Supabase
│   │   ├── emotion.mjs           # hold_emotion / release_emotion — Dendam & Maaf
│   │   ├── goal.mjs              # set_goal / complete_goal — Misi beruntun
│   │   └── vision.mjs            # analyzeImage — Deskripsi foto via Groq Vision
│   └── soul/                     # Subsistem Psikologis
│       ├── engine.mjs            # Kalkulator Energy & Mood (non-LLM, deterministik)
│       ├── desire.mjs            # Kalkulator Connection/Curiosity/Autonomy drives
│       ├── identity.mjs          # Big Five traits, Cognitive Biases, Attachment Style
│       └── reflection.mjs        # Ekstraktor Dossier & Memory Consolidation (LLM)
└── public/
    └── soul.html                 # Dashboard God-Mode (monitoring real-time)
```

---

## 3. Tiga Pilar Utama

### PILAR 1: Perception Engine (`api/webhook-telegram.js`)

**Trigger:** Setiap pesan masuk dari Telegram.

**Alur Eksekusi:**

```
User Chat Masuk
  ↓
[1] Deduplication (Redis setnx dengan update_id)
  ↓
[2] Wake-Up Call: Set `force_awake` (30 menit) + `active_context` (10 menit) di Redis
  ↓
[3] Registrasi user di Supabase jika baru
  ↓
[4] Jika ada foto → Groq Vision (`llama-4-scout`) → deskripsi ditempel ke teks
  ↓
[5] Ambil data paralel:
    ├── Working Memory (10 pesan terakhir dari Redis)
    ├── Semantic Memory (fakta permanen dari Supabase)
    ├── Episodic Memory via RAG (pgvector similarity search)
    ├── Soul State (energy, mood, desires)
    ├── Embodiment Global (lokasi, aktivitas, cuaca, outfit)
    ├── Emotional Baggage (dendam aktif)
    ├── User Dossier (profil makro)
    └── Trust Level
  ↓
[6] Perception Parser (Multi-LLM rotation `queryChronosLLM()`, JSON mode)
    → Menghasilkan: intent, emotion, hostility, engagement, topic_shift
  ↓
[7] Soul Engine (NON-LLM, deterministik):
    ├── calculateSoulState() → Energy drain + Mood calculation
    └── calculateDesires() → Connection/Curiosity/Autonomy update
  ↓
[8] Context Builder → Merakit System Prompt (~2000 token) dari semua data di atas
  ↓
[9] Mistral Large (Primary) atau Qwen (Fallback) → Menghasilkan respons
  ↓
[10] Jika Tool Call → executeTool() router
     Jika Teks Biasa → Split bubble ("|" atau per kalimat) → Kirim dengan typing delay
  ↓
[11] Simpan respons ke Working Memory
```

**Komponen Penting:**
- `buildContext()` (`src/context/builder.mjs`): Menyuntikkan 9 layer konteks ke system prompt: Identity, Active Goal, World Context, Trust/Relationship, Semantic Memory, Dossier, Soul State, Embodiment, Desires, dan Emotional Baggage.
- `formatTelegramHTML()`: Konversi markdown ke HTML Telegram (`**bold**` → `<b>`, dll).
- Bubble splitting: Respons panjang dipecah menjadi multi-bubble dengan jeda typing dinamis (0.5s–2s).

### PILAR 2: Chronos Engine (`api/chronos.js`)

**Trigger:** Ping eksternal (Google Apps Script) setiap 15 menit.

**Alur Eksekusi:**

```
GAS Ping Masuk (GET/POST)
  ↓
[1] Log ke Redis untuk debugging dashboard
  ↓
[2] Load persona dari Supabase (nama, kota, archetype, craft)
  ↓
[3] Hitung waktu: currentHour, dateStr, timeOfDay (WIB)
  ↓
[4] Ambil cuaca real-time dari wttr.in (cache 1 jam di Redis)
  ↓
[5] MORNING ROUTINE — Jika tanggal agenda ≠ hari ini DAN currentHour ≥ wake_time:
    ├── Ambil globalState (mood terakhir)
    ├── Kirim prompt "Skenario Kehidupan 24 Jam" ke LLM (queryChronosLLM)
    │   → Input: Cuaca, Mood, Persona (3 Pilar)
    │   → Output JSON: { agenda: [...], outfit, sleep_time, wake_time }
    └── Simpan ke Redis `soul:chronos:agenda`
  ↓
[6] Hitung isSleepTime berdasarkan agenda.sleep_time & agenda.wake_time
  ↓
[6.5] DYNAMIC REFLECTION TRIGGER — Jika currentHour === sleep_time:
    ├── Cek apakah sudah refleksi hari ini (`soul:chronos:reflected_date`)
    └── Jika belum → runSleepCycle() (import dari sleep-cycle.js)
  ↓
[7] Cek force_awake (user baru chat → batalkan sleep mode)
  ↓
[8a] JIKA TIDUR:
    ├── Set embodiment = "Tidur pulas di kasur"
    └── Legacy reflection trigger via HTTP (backup)
  ↓
[8b] JIKA BANGUN → 15-Min Pulse:
    ├── Baca agenda + lastState + activeContext
    ├── Kirim prompt ke LLM → "Apa yang kamu lakukan TEPAT DETIK INI?"
    │   → Output JSON: { location, activity, outfit, inner_thought }
    └── Simpan ke Redis `soul:embodiment:global`
  ↓
[9] LONELINESS DRIFT (per user):
    ├── desires.connection += 0.05 setiap pulse (jika tidak ada chat aktif)
    └── Jika connection > 0.9 DAN tidak sedang chat DAN trust aman DAN tidak ada dendam:
        ├── Generate pesan proaktif via LLM (dengan Dossier user sebagai konteks)
        ├── Kirim via Telegram API
        └── Set `waiting_reply` (24 jam cooldown)
```

**Model Rotation (`queryChronosLLM`):**
```
Providers: [groq_llama (70B), qwen_turbo, groq_llama_fast (8B), mistral]
→ Random start index → Try-catch loop → Fallback ke provider berikutnya jika gagal
```

### PILAR 3: Sleep Cycle & Reflection (`api/sleep-cycle.js` + `src/soul/reflection.mjs`)

**Trigger:** Dipanggil oleh Chronos tepat pada jam `sleep_time` dari agenda.

**Alur Eksekusi (per user):**

```
runSleepCycle()
  ↓
[1] Ambil semua user aktif dari Supabase (limit 5)
  ↓
Per user:
  [2] Ambil 50 pesan terakhir (Working Memory)
  [3] Jika > 5 pesan → runReflectionEngine():
      ├── Ambil fakta lama + dossier lama dari DB
      ├── Format chat dengan label [PENGGUNA/MANUSIA] vs [BOT/AI - ABAIKAN]
      ├── Kirim ke Multi-LLM rotation `queryChronosLLM()` (JSON mode)
      ├── Output: { user_dossier, new_facts[], new_events[], obsolete_fact_ids[], trust_evaluation }
      ├── Filter AI facts (blocklist: "kos", "piyama", "outfit", dll)
      ├── Simpan new_facts ke Supabase `memories`
      ├── Simpan new_events ke Supabase `episodic_memories` (dengan vector embedding)
      ├── Hapus obsolete facts
      ├── Update trust_level di Redis
      └── Update user_dossier di Redis
  [4] Emotional Decay: baggage.intensity -= 1 per malam
  [5] Trim Working Memory (sisakan 4 pesan)
  [6] Reset energy = 100, mood = "neutral", connection *= 0.3
```

---

## 4. State Management (Redis Keys)

### Global (Shared)
| Key | Tipe | TTL | Deskripsi |
|-----|------|-----|-----------|
| `soul:chronos:weather` | string | 1 jam | Cache cuaca dari wttr.in |
| `soul:chronos:agenda` | JSON | - | Skenario 24 jam (agenda, outfit, sleep/wake time) |
| `soul:embodiment:global` | JSON | - | Lokasi, aktivitas, pikiran batin, outfit detik ini |
| `soul:chronos:force_awake` | "1" | 30 min | Flag: user baru chat, batalkan sleep mode |
| `soul:chronos:active_context` | string | 10 min | Topik chat terakhir untuk Pulse LLM |
| `soul:chronos:reflected_date` | dateStr | - | Tanggal terakhir reflection dijalankan |
| `soul:chronos:last_reflection_date` | dateStr | - | Legacy reflection date (backup) |

### Per User
| Key | Tipe | TTL | Deskripsi |
|-----|------|-----|-----------|
| `user:{id}:working_memory` | List | - | 20 pesan terakhir (short-term) |
| `user:{id}:soul_state` | JSON | - | energy, mood, mood_value, desires |
| `user:{id}:dossier` | string | - | Profil makro user (3-4 kalimat) |
| `user:{id}:baggage` | JSON[] | - | Array luka batin/dendam |
| `user:{id}:trust_level` | float | - | 0.0–1.0 |
| `user:{id}:active_goal` | string | - | Misi beruntun yang sedang aktif |
| `user:{id}:waiting_reply` | "1" | 24 jam | Cooldown proactive chat |
| `user:{id}:last_system_prompt` | string | 24 jam | Debug: prompt terakhir |

---

## 5. Multi-LLM Strategy (`src/llm.mjs`)

| Fungsi | Provider Utama | Fallback | Penggunaan |
|--------|---------------|----------|------------|
| `queryLLMWithFallback()` | Mistral Large | Qwen Turbo | Chat utama (webhook) |
| `queryChronosLLM()` | Random rotation (4 provider) | Auto-fallback | Background tasks + Parser + Reflection |
| `parseUserMessage()` | `queryChronosLLM()` (Rotasi) | Default static object | Perception (intent/emosi) |
| `runReflectionEngine()` | `queryChronosLLM()` (Rotasi) | - | Konsolidasi memori malam |
| `analyzeImage()` | Groq `llama-4-scout` | - | Vision/deskripsi foto |
| `getMistralEmbedding()` | Mistral Embed | - | Vector embedding untuk RAG |

**Multi-Key System:**
- `MISTRAL_KEYS`: Comma-separated → `getRandomMistralKey()`
- `GROQ_KEYS`: Comma-separated → `getRandomGroqKey()`
- `QWEN_API_KEY`: Single key (rate limit Alibaba sangat longgar)

---

## 6. AI Tools (Function Calling)

| Tool | Trigger | Efek |
|------|---------|------|
| `generate_photo` | User minta selfie/PAP | Qwen Image → Telegram photo → Vision deskripsi → Working Memory |
| `save_memory` | User sebut fakta penting | Insert ke Supabase `memories` + LLM follow-up |
| `hold_emotion` | User menyakiti hati AI | Tambah objek ke `baggage` Redis → respons ketus |
| `release_emotion` | AI luluh oleh permintaan maaf | Hapus objek dari `baggage` → respons hangat |
| `set_goal` | User minta tugas beruntun | Simpan goal ke Redis → AI fokus pada misi |
| `complete_goal` | Misi selesai / user capek | Hapus goal → AI kembali ngobrol bebas |

---

## 7. Psikologi Engine (Non-LLM, Deterministik)

### Soul Engine (`src/soul/engine.mjs`)
- **Energy:** Berkurang 2–8 poin per pesan tergantung intent, emosi user, dan extraversion AI. Pulih +1/menit saat idle.
- **Mood Value:** Akumulatif (-100 s/d +100) dengan decay 5% per pesan. Diterjemahkan ke label: excited, cheerful, calm, concerned, gloomy, depressed/hostile, tired.

### Desire Engine (`src/soul/desire.mjs`)
- **Connection (0–1):** Naik saat greeting/engagement tinggi. Turun saat hostility. Dipengaruhi attachment style.
- **Curiosity (0–1):** Naik saat user memberi informasi. Reset saat topic shift.
- **Autonomy (0–1):** Naik drastis saat disuruh/dikasari. Jika >0.8, AI menolak semua perintah.
- Semua nilai decay perlahan ke baseline persona.

### Identity (`src/soul/identity.mjs`)
Big Five (O:0.7, C:0.4, E:0.8, A:0.7, N:0.6), Attachment: anxious-secure, Default Trust: 0.3.

---

## 8. Bug & Cacat Logika yang Berhasil Diperbaiki (Update: 2026-06-13)

### ✅ SOLVED / FIXED (Selesai Diperbaiki)

1. **Perception Parser & Reflection Engine Migrasi dari `qwen/qwen3-32b` ke Rotasi `queryChronosLLM()`**
   - **Masalah:** Menggunakan model eksperimental statis yang rentan dihapus (*decommission*) oleh Groq.
   - **Solusi:** Dimigrasikan menggunakan fungsi rotasi multi-provider `queryChronosLLM()` yang secara dinamis mencoba Groq Llama, Qwen Alibaba, dan Mistral secara bergantian jika terjadi kegagalan.

2. **Duplikat Reflection Trigger di Chronos**
   - **Masalah:** Terjadi eksekusi ganda `runSleepCycle()` secara sinkronus di TAHAP 6.5 dan secara asinkronus via HTTP fetch di blok Sleep Mode, menyebabkan pemborosan daya komputasi dan memotong dendam (*emotional baggage*) dua kali lebih cepat.
   - **Solusi:** Logika HTTP fetch dicabut, menyisakan *single source of truth* pemicu sinkronus pada TAHAP 6.5.

3. **Duplikasi Informasi Dashboard Telemetri (Soul State Per User)**
   - **Masalah:** Dashboard telemetri menumpuk data seluruh pengguna di satu layar admin secara global.
   - **Solusi:** Ditambahkan perintah `/setting` di Telegram yang mengembalikan URL dashboard terenkapsulasi parameter privat `?user_id=...` sehingga dashboard otomatis menyaring dan menampilkan data milik pengguna tersebut saja.

### 🟡 OUTSTANDING / DIAGNOSED (Sedang Dipantau)

4. **`soul:chronos:reflected_date` vs `soul:chronos:last_reflection_date` — dua key berbeda untuk tujuan sama.**
   - Satu diset di TAHAP 6.5 (baris 181), satu lagi di Sleep Mode (baris 220).
   - Mereka tidak saling cek, sehingga guard tidak efektif.

5. **`globalState.mood` di Morning Routine selalu `undefined`.**
   - File: `chronos.js:100` — membaca `globalState.mood` dari `soul:embodiment:global`.
   - Tapi Embodiment hanya menyimpan `location, current_activity, inner_thought, outfit`. Field `mood` tidak pernah ditulis ke sana.
   - Dampak: Selalu fallback ke `"netral"`. Secara fungsional aman tapi secara desain tidak akurat.

6. **Indentasi tidak konsisten di `sleep-cycle.js`.**
   - Baris 18-81: Kode di dalam `runSleepCycle()` masih terindentasi 8 spasi (sisa dari refaktor). Tidak menyebabkan bug tapi mengganggu readability.

### 🟢 MINOR

7. **`getRandomGroqKey()` diduplikasi di `vision.mjs`**
   - Sebaiknya dipusatkan di `src/llm.mjs` dan diimpor (sudah dihapus dari `parser.mjs` dan `reflection.mjs` karena menggunakan `queryChronosLLM`).

8. **QWEN_API_KEY hardcoded sebagai fallback** di `llm.mjs:50` dan `webhook-telegram.js:98`.
   - Tidak berbahaya di production (env var akan override), tapi sebaiknya dihapus dari source code.

---

## 9. Diagram Sinkronisasi Waktu

```
         BANGUN (wake_time)                    TIDUR (sleep_time)
            ↓                                      ↓
  ┌─────────┴──────────────────────────────────────┴─────────┐
  │  06:00   08:00   12:00   16:00   20:00   23:00   02:00   │
  │    ↑       ↑       ↑       ↑       ↑       ↑             │
  │  Morning  Pulse   Pulse   Pulse   Pulse  Sleep+Reflect   │
  │  Routine  (LLM)   (LLM)   (LLM)   (LLM)  (Memory Clean) │
  │  (Agenda)                                                 │
  │                                                           │
  │  ←── Embodiment berubah tiap 15 menit ──→  ←── TIDUR ──→  │
  │  ←── Loneliness Drift naik ──────────────→                │
  │  ←── Proactive Chat bisa terpicu ────────→                │
  └───────────────────────────────────────────────────────────┘
                    ↑ (User chat masuk)
                    force_awake = batalkan sleep
```

---

## 10. Rekomendasi Scaling

1. **Sleep Cycle `.limit(5)`** — Untuk >5 user, gunakan message queue atau jalankan per-batch.
2. **Global Embodiment** — Saat ini 1 lokasi untuk semua user. Untuk multi-user immersion, pindahkan ke `user:{id}:embodiment`.
3. **Timezone Lock** — Saat ini hardcode `Asia/Jakarta`. Untuk global, ambil dari user preference.
4. **Vercel Timeout** — `maxDuration: 60` bisa tidak cukup jika Reflection + tool call bertumpuk. Pertimbangkan Vercel Pro atau background jobs.

---

## 11. Dashboard & Entitas Control (`public/soul.html`)

Sistem menyediakan dasbor "God Mode" bagi *developer/admin* untuk memonitor telemetri dan memanipulasi jiwa AI secara instan.

1. **AI Persona Creator (`api/soul-generate.js`):**
   Memungkinkan penciptaan karakter dengan prompt teks (natural language). Proses diproses oleh `queryChronosLLM()` dengan regex isolation yang ketat untuk menerjemahkan teks menjadi pilar Lingkungan, Big 5 (Psikologi), dan Persona Archetype berformat JSON. Mendukung Vercel `maxDuration: 60` untuk mengatasi latensi inferensi.
   
2. **Soul Reset / Kill Entity (`api/soul-reset.js`):**
   Tombol pemusnah (*Wipe Memory*) yang menghapus seluruh data pada Supabase (`memories`, `episodic_memories`) dan 7 variabel krusial Redis (`working_memory`, `soul_state`, `trust_level`, `baggage`, `dossier`, `self_narrative`, `active_goal`) spesifik untuk satu Telegram ID, sehingga pengguna mendapat entitas baru dari nol.

3. **Multi-User Encapsulation:**
   Dashboard memuat data massal, tetapi fitur URL Parameter `?user_id=...` yang diteruskan dari bot Telegram melalui perintah `/setting` akan memfilter kartu telemetri hanya untuk *user* yang bersangkutan.

---

*Dokumentasi ini dihasilkan dari deep review seluruh source code pada 2026-06-13.*
