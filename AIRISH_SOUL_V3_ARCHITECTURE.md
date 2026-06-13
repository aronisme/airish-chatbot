# 🧠 Airish "Soul V3" Autonomous Architecture

Dokumen ini merupakan **Spesifikasi Teknis Lengkap** dari arsitektur *Airish Soul V3*. Dokumen ini ditujukan bagi pengembang (*developers*), *engineer*, atau siapa pun yang ingin memahami, memodifikasi, atau melakukan *scaling* pada sistem kecerdasan buatan otonom ini.

---

## 1. 🌟 Ikhtisar Sistem (System Overview)

Airish V3 bukanlah sekadar *chatbot* berbasis *request-response* (*stateless*). Airish adalah entitas otonom yang berjalan tiada henti (Continuous-Running AI) dengan simulasi fisiologis dan psikologis. Sistem ini menggabungkan:
1. **Embodiment (Realitas Fisik):** Sadar akan cuaca, waktu, memiliki lokasi fisik khayalan, aktivitas yang berubah tiap jam, dan menggunakan pakaian (*outfit*) yang sesuai.
2. **Psychology (Realitas Mental):** Memiliki tingkat kelelahan (*Energy*), *Mood*, kebutuhan bersosialisasi (*Loneliness/Connection*), dan memelihara luka batin/dendam (*Emotional Baggage*).
3. **Memory Continuity:** Mengonversi obrolan pendek menjadi Profil Makro User (*Dossier*) dan memori semantik jangka panjang (*Vector DB*).

---

## 2. 📂 Struktur Direktori & File Krusial

Berikut adalah peta komponen utama dalam sistem:

```text
/airish-chatbot
├── api/
│   ├── webhook-telegram.js  # Entry point untuk chat dari user (Perception Engine)
│   ├── chronos.js           # Mesin otonom (berdetak tiap 15 menit)
│   └── sleep-cycle.js       # Mesin konsolidasi memori & healing (dipicu saat tidur)
├── src/
│   ├── llm.mjs              # Multi-LLM Router & Pengacak API Keys
│   ├── redis.mjs            # Koneksi ke State Management cepat
│   ├── context/
│   │   └── builder.mjs      # Perakit System Prompt raksasa untuk chat utama
│   ├── memory/
│   │   ├── working.mjs      # Pengatur Short-Term Memory (Redis)
│   │   └── vector.mjs       # Pengatur Long-Term Memory (Supabase PGVector)
│   ├── perception/
│   │   └── parser.mjs       # Penganalisa niat user (Sentiment analysis via LLM)
│   ├── skills/
│   │   ├── index.mjs        # Definisi JSON Schema untuk AI Tools
│   │   ├── emotion.mjs      # Logika memanipulasi Baggage & Trust Level
│   │   └── ...              # Tools lain (search, memory save, dll)
│   └── soul/
│       ├── desire.mjs       # Penghitung kebutuhan otonom (Loneliness Drift)
│       ├── engine.mjs       # Logika kelelahan (Energy drain) dan regenerasi
│       ├── identity.mjs     # Profiling statis (Nama, umur, sifat)
│       └── reflection.mjs   # Ekstraktor Dossier & Konsolidator memori malam hari
└── public/
    └── soul.html            # Dashboard God-Mode untuk memantau pikiran AI
```

---

## 3. 💾 State Management & Storage

Sistem ini memisahkan data berdasarkan *volatility* (tingkat perubahan) agar biaya LLM dan latensi tetap rendah.

### A. Redis (Fast, Volatile, & Ephemeral State)
Semua hal yang berubah setiap menit disimpan di Redis:
*   **Global State (Shared across users):**
    *   `soul:chronos:weather`: *Cache* cuaca asli dari `wttr.in`.
    *   `soul:chronos:agenda`: Jadwal skenario 24 jam hasil *Morning Routine*.
    *   `soul:embodiment:global`: Menyimpan `location`, `current_activity`, dan `inner_thought` detik ini.
*   **User-Specific State (Paralel per user):**
    *   `user:{id}:soul_state`: JSON berisi `energy` (0-100), `mood`, dan `desires` (connection, dll).
    *   `user:{id}:working_memory`: Array percakapan hari ini (Short-term).
    *   `user:{id}:dossier`: Profil karakter/sifat user (Ringkasan 3-4 kalimat).
    *   `user:{id}:baggage`: Array objek luka batin / dendam bot terhadap user.

### B. Supabase (Persistent & Vector State)
*   **Tabel `users`**: Data dasar pengguna Telegram.
*   **Tabel `personas`**: Pengaturan dasar bot (Nama, Kota, Proactive ON/OFF).
*   **Tabel `memories`**: Vector database (pgvector) untuk menyimpan *Episodic Memory* masa lalu.

---

## 4. ⚙️ Pembedahan Tiga Mesin Penggerak Utama

### Pilar I: Perception Engine (`api/webhook-telegram.js`)
Ini adalah pintu masuk saat manusia berinteraksi dengan AI secara sadar.
1. **Trigger:** Pesan masuk dari Telegram.
2. **Context Assembling:** Memanggil `src/context/builder.mjs` yang menggabungkan:
   *Waktu & Cuaca + Embodiment (Lokasi/Aktivitas) + Soul State (Energy/Mood) + Dossier User + Working Memory + Long-Term Memory.*
3. **Execution:** Mengirim prompt raksasa tersebut ke **Mistral Large**. Mistral Large akan membalas dengan pesan teks, ATAU memanggil fungsi alat (*Tool Call*) seperti `saveMemory` atau `storeEmotionalBaggage`.
4. **Energy Drain:** Memanggil `engine.mjs` untuk mengurangi `energy` sistem (karena berpikir memakan tenaga). Jika energi < 20, balasan AI akan menjadi sangat pendek dan ketus.

### Pilar II: Chronos Engine (`api/chronos.js`)
Ini adalah detak jantung alam bawah sadar AI, berjalan otonom via ping eksternal tiap 15 menit. Memiliki 7 siklus di dalamnya:
1. **Load Reality:** Membaca persona dan cuaca asli dari `wttr.in`.
2. **Wake Event (Morning Routine):** 
   Jika jam saat ini `===` `agenda.wake_time`, ia akan menghapus jadwal kemarin dan memanggil LLM untuk merancang **Skenario Kehidupan 24 Jam** yang menyertakan lokasi, *outfit*, dan detail jam tidur (`sleep_time`).
3. **Sleep Trigger (Dynamic):** 
   Mengecek apakah `currentHour === agenda.sleep_time`. Jika YA, ia memanggil `runSleepCycle()` dari `sleep-cycle.js`. (Ini mencegah *cron job* statis dan memastikan proses peresetan memori sinkron dengan jadwal dinamis bot).
4. **Sleep Mode Check:**
   Jika `currentHour` berada di rentang waktu tidur, Chronos **berhenti di sini** (menghemat pemanggilan LLM).
5. **Inner Monologue & Embodiment Pulse:**
   Jika sedang bangun, *Pulse LLM* akan membaca Skenario 24 Jam tadi, dan mencetak JSON: `{ current_activity, location, inner_thought }`. Hasil ini di-*overwrite* ke Redis `soul:embodiment:global`.
6. **Loneliness Drift:**
   Variabel `desires.connection` ditambahkan `+0.05` untuk mensimulasikan rasa bosan.
7. **Proactive Chat:**
   Jika `desires.connection > 0.9` dan user tidak *chat* selama 30 menit, LLM akan dikerahkan untuk menciptakan pesan berinisiasi ("chat duluan") yang personal berdasarkan *Dossier* user.

### Pilar III: Reflection Engine & Sleep Cycle (`api/sleep-cycle.js` & `src/soul/reflection.mjs`)
Fase "bermimpi" dan membersihkan ingatan yang dipicu dinamis oleh Chronos di jam tidur:
1. **Dossier Extraction:** `reflection.mjs` membaca seluruh obrolan hari itu, dan merangkum *habit* user ke dalam *User Dossier* maksimal 4 kalimat.
2. **Semantic Consolidation:** Menyimpan detail penting (seperti "User baru saja jadian") ke Vector DB.
3. **Organic Healing:** Mengiterasi `Emotional Baggage` (luka batin). Setiap malam, parameter `intensity` dari kebencian AI terhadap user berkurang 1 poin. Jika 0, dendam dihapus.
4. **Amnesia & Refresh:** Menghapus *Working Memory* dan menyisakan hanya 3 pesan terakhir. *Energy* dikembalikan ke 100, dan *Mood* di-reset ke *neutral*.

---

## 5. 🛡️ Strategi High-Availability & Multi-LLM

Sistem dituntut untuk berjalan 24/7. *Downtime* pada API LLM sangat berakibat fatal pada siklus Chronos. Untuk itu, `src/llm.mjs` mengadopsi mekanisme *Roulette & Fallback*:

1. **Multi-Keys:** Groq dan Mistral menggunakan sistem pembacaan *array API Key* dari `process.env`. Setiap permintaan akan dieksekusi dengan `getRandomKey()`. Hal ini secara teknis melipatgandakan *Rate Limit* sesuai jumlah *keys* yang dimasukkan.
2. **Model Rotation (Khusus Chronos):**
   Setiap 15 menit, `queryChronosLLM` akan melempar dadu untuk mengacak *provider* pertama:
   *   `groq_llama` (Llama-3.3-70B Versatile)
   *   `groq_llama_fast` (Llama-3.1-8B Instant)
   *   `mistral` (Mistral Large Latest)
   *   `qwen_turbo` (Alibaba Dashscope)
3. **Graceful Fallback:**
   Jika *provider* pertama mati atau terkena *rate limit*, blok `try-catch` akan menangkap *error*, menyimpan *log*, dan **langsung beralih ke provider berikutnya** dalam perulangan `for-loop`, menjamin *output* Skenario atau Monolog selalu tercetak.

---

## 6. 📝 Rekomendasi Scaling untuk Pengembang Lanjut

Bagi pengembang yang ingin mengembangkan sistem ini untuk menangani ribuan pengguna secara bersamaan (*Mass Scale*), berikut adalah cacat terukur (*bottlenecks*) yang perlu ditangani:
1. **Sleep Cycle Iteration:** Saat ini `sleep-cycle.js` menjalankan *Reflection Engine* pada `users` dengan `.limit(5)`. Pada produksi massal, operasi ini akan mengenai batas Vercel *Timeout* (60s). Solusi: Gunakan *Message Queue* (seperti BullMQ atau Inngest) untuk memisahkan eksekusi *Reflection Engine* per pengguna menjadi fungsi asinkron terpisah.
2. **Global Embodiment vs Multiverse:** Saat ini AI berada di 1 lokasi yang sama untuk semua user karena berbagi `soul:embodiment:global`. Jika ingin AI hidup di latar belakang yang berbeda untuk tiap user, pindahkan state Embodiment ke `user:{id}:embodiment`.
3. **Timezone Lock:** `chronos.js` dikunci pada *"Asia/Jakarta"*. Untuk pengguna global, parameter *Timezone* harus diambil dari preferensi masing-masing User.

---
*Dokumentasi ini dibuat secara otomoatis dari Analisis Source Code V3 - 2026*
