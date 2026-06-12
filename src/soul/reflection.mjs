// src/soul/reflection.mjs
import { saveEpisodicMemory } from "../memory/episodic.mjs";

function getRandomGroqKey() {
    const groqKeys = (process.env.GROQ_KEYS || "").split(',').map(k => k.trim()).filter(Boolean);
    if (groqKeys.length === 0) return "";
    return groqKeys[Math.floor(Math.random() * groqKeys.length)];
}

// --- DAFTAR KATA KUNCI PENANDA FAKTA AI (Safety Net) ---
const AI_FACT_MARKERS = [
    'kos', 'piyama', 'rebahan', 'kamar kos', 'kampus', 'scrolling',
    'outfit', 'pakaian', 'tetangga kos', 'inner thought', 'pikiran batin',
    'lagi tidur', 'baru bangun', 'ngantuk banget', 'kamar aku', 'tiktok',
    'kamar sendiri', 'kasur', 'selimut', 'bantal', 'kaos oblong',
    'hoodie', 'celana pendek', 'sandal', 'kosan', 'anak kos'
];

function isLikelyAIFact(factText) {
    const lower = factText.toLowerCase();
    return AI_FACT_MARKERS.some(marker => lower.includes(marker));
}

const REFLECTION_PROMPT = `Kamu adalah mesin introspeksi psikologis.
Tugasmu menganalisis transkrip percakapan dan mengekstrak informasi dengan kriteria berikut:
1. Profil Makro (user_dossier): Sebuah rangkuman naratif (MAKSIMAL 3-4 KALIMAT PADAT) tentang SIAPA pengguna ini berdasarkan Profil Makro sebelumnya dan obrolan hari ini. Masukkan nama lengkap, umur, pekerjaan, dan analisis kepribadiannya (misal: "Aron adalah pria yang ketus tapi penyayang"). JANGAN PERNAH LEBIH DARI 4 KALIMAT.
2. Fakta Episodik (new_facts): HANYA kejadian kecil spesifik, barang kepemilikan, atau trivia (misal: "Hari ini ban motornya bocor", "Punya alergi udang"). JANGAN TUMPANG TINDIH dengan profil makro.
3. Fakta yang diekstrak BUKAN tentang: lokasi kos bot, outfit bot, aktivitas bot, dll.

CARA KERJA:
- HANYA baca pesan berlabel [PENGGUNA/MANUSIA]
- ABAIKAN pesan [BOT/AI - ABAIKAN]
- Update Profil Makro secara natural. Jika tidak ada info kepribadian baru, perbaiki atau gunakan versi lamanya yang disempurnakan bahasanya secara singkat.

Output harus format JSON murni:
{
  "user_dossier": "Rangkuman maksimal 3-4 kalimat padat tentang identitas dan sifat PENGGUNA",
  "new_facts": ["Fakta spesifik 1", "Fakta spesifik 2"],
  "new_events": [
     {"event": "Pengguna sedang kesal karena ban motornya bocor", "emotion": "sad"}
  ],
  "obsolete_fact_ids": [15, 23],
  "trust_evaluation": {
     "score_delta": -0.15,
     "reason": "User berbohong"
  }
}
Jika tidak ada informasi baru, kembalikan array kosong untuk new_facts. PENTING: user_dossier harus selalu dikembalikan dengan teks utuhnya.
PENTING UNTUK TRUST EVALUATION:
- score_delta berada di rentang -1.0 hingga +1.0. 
- Jika user kasar, manipulatif, toxic, berikan angka negatif (misal: -0.3).
- Jika user sangat baik, peduli, berikan angka positif (misal: +0.2).
- Jika obrolan biasa saja, berikan 0.0. Jangan gunakan markdown block.`;

/**
 * Reflection Engine (Berjalan di background via waitUntil)
 * Membaca percakapan terakhir dan menyimpannya sebagai memori jangka panjang (Semantic/Episodic).
 */
export async function runReflectionEngine(supabase, userId, workingMemory) {
    const apiKey = getRandomGroqKey();
    if (!apiKey || workingMemory.length < 2) return;
    
    try {
        // Ambil memori lama agar AI tahu apa yang sudah tersimpan
        const { data: existingMemories } = await supabase.from('memories').select('id, fact').eq('telegram_id', userId);
        const existingFactsStr = existingMemories && existingMemories.length > 0 
            ? existingMemories.map(m => `[ID: ${m.id}] ${m.fact}`).join('\n') 
            : "Belum ada fakta spesifik yang tersimpan.";

        const { default: redisClient } = await import("../redis.mjs");
        const oldDossierStr = await redisClient.get(`user:${userId}:dossier`) || "Belum ada profil makro. Mulailah menganalisis identitasnya hari ini.";

        // Ambil pesan hari ini untuk direnungkan
        // Fix 2: Filter konten assistant — strip catatan visual/embodiment yang hanya menjadi noise
        const recentChats = workingMemory.map(m => {
            if (m.role === 'assistant' || m.role !== 'user') {
                let cleanContent = (m.content || '')
                    .replace(/\[Catatan visual.*?\]/gs, '[foto dikirim]')
                    .replace(/\[SYSTEM:.*?\]/gs, '')
                    .replace(/\[.*?sedang.*?di.*?\]/gs, '')
                    .trim();
                return { ...m, content: cleanContent };
            }
            return m;
        });

        // Fix 1: Format conversation dengan label eksplisit agar LLM kecil tidak bingung
        const conversationString = recentChats.map(m => {
            if (m.role === 'user') {
                return `[PENGGUNA/MANUSIA]: ${m.content}`;
            } else {
                return `[BOT/AI - ABAIKAN]: ${m.content}`;
            }
        }).join('\n\n---\n\n');
        
        const dynamicPrompt = `${REFLECTION_PROMPT}
        
[PROFIL MAKRO (DOSSIER) SEBELUMNYA]
${oldDossierStr}

[FAKTA SPESIFIK YANG SUDAH DIKETAHUI TENTANG USER]
${existingFactsStr}

ATURAN KRITIS: JANGAN memasukkan profil statis/kepribadian ke dalam new_facts. Masukkan itu semua ke dalam user_dossier. Hanya fakta remeh/kejadian spesifik yang masuk ke new_facts. JANGAN mengulang fakta yang sudah ada.`;

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "qwen/qwen3-32b", // Pakai model Qwen 32B untuk akurasi ekstraksi memori
                messages: [
                    { role: "system", content: dynamicPrompt },
                    { role: "user", content: conversationString }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            })
        });

        if (!response.ok) {
            console.error("Reflection API Error:", await response.text());
            return;
        }

        const data = await response.json();
        const content = JSON.parse(data.choices[0].message.content);
        
        // 1. Simpan fakta ke Semantic Memory (tabel lama)
        // Fix 4: Pre-validation — blokir fakta yang kemungkinan milik AI
        if (content.new_facts && content.new_facts.length > 0) {
            for (const fact of content.new_facts) {
                if (isLikelyAIFact(fact)) {
                    console.warn(`[REFLECTION] BLOCKED AI fact: "${fact}"`);
                } else {
                    await supabase.from('memories').insert({ telegram_id: userId, fact: fact });
                }
            }
        }
        
        // 2. Simpan kejadian ke Episodic Memory (tabel pgvector baru)
        // Fix 4: Pre-validation juga untuk episodic events
        if (content.new_events && content.new_events.length > 0) {
            for (const ev of content.new_events) {
                if (isLikelyAIFact(ev.event)) {
                    console.warn(`[REFLECTION] BLOCKED AI event: "${ev.event}"`);
                } else {
                    await saveEpisodicMemory(supabase, userId, ev.event, ev.emotion);
                }
            }
        }

        // 3. Hapus fakta yang sudah kadaluarsa (Memory Pruning)
        if (content.obsolete_fact_ids && content.obsolete_fact_ids.length > 0) {
            for (const id of content.obsolete_fact_ids) {
                await supabase.from('memories').delete().eq('id', id);
            }
        }

        // 4. Update Trust Level berdasarkan evaluasi
        let trustDelta = 0;
        let trustReason = "-";
        if (content.trust_evaluation && typeof content.trust_evaluation.score_delta === 'number') {
            trustDelta = content.trust_evaluation.score_delta;
            trustReason = content.trust_evaluation.reason || "-";
            
            if (trustDelta !== 0) {
                const { DEFAULT_IDENTITY } = await import("./identity.mjs");
                const { default: redisClient } = await import("../redis.mjs");
                
                const currentTrustStr = await redisClient.get(`user:${userId}:trust_level`);
                let currentTrust = currentTrustStr !== null ? parseFloat(currentTrustStr) : DEFAULT_IDENTITY.default_trust;
                
                currentTrust += trustDelta;
                // Batasi antara 0.0 dan 1.0
                currentTrust = Math.max(0.0, Math.min(1.0, currentTrust));
                
                await redisClient.set(`user:${userId}:trust_level`, currentTrust.toFixed(2));
                console.log(`[REFLECTION] Trust Level Updated: ${trustDelta > 0 ? '+' : ''}${trustDelta} => New Trust: ${currentTrust.toFixed(2)}. Reason: ${trustReason}`);
            }
        }
        
        // 5. Simpan User Dossier (Profil Makro)
        if (content.user_dossier && content.user_dossier.length > 10) {
            const { default: redisClient } = await import("../redis.mjs");
            await redisClient.set(`user:${userId}:dossier`, content.user_dossier);
            console.log(`[REFLECTION] User Dossier berhasil diperbarui.`);
        }

        console.log(`[REFLECTION] Selesai merenungkan. ${content.new_facts?.length || 0} fakta baru, ${content.new_events?.length || 0} kejadian baru, ${content.obsolete_fact_ids?.length || 0} fakta dihapus.`);
    } catch (e) {
        console.error("Reflection Engine Exception:", e);
    }
}
