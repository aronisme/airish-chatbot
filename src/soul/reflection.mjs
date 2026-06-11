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
Tugasmu menganalisis transkrip percakapan dan mengekstrak HANYA fakta yang memenuhi SEMUA kriteria berikut:
1. Fakta tersebut DICERITAKAN/DIKETIK oleh entitas berlabel [PENGGUNA/MANUSIA]
2. Fakta tersebut adalah tentang KEHIDUPAN PRIBADI pengguna manusia itu sendiri
3. Fakta tersebut BUKAN tentang: lokasi kos bot, outfit bot, rebahan bot, kampus bot, aktivitas fisik bot, atau perasaan bot

CARA KERJA:
- HANYA baca pesan berlabel [PENGGUNA/MANUSIA]
- ABAIKAN SEPENUHNYA semua pesan berlabel [BOT/AI - ABAIKAN]
- Jika ragu apakah fakta milik pengguna atau bot, JANGAN EKSTRAK
- JANGAN PERNAH mengekstrak deskripsi pakaian, lokasi, aktivitas, atau pikiran batin dari pesan bot

Output harus format JSON murni:
{
  "new_facts": ["fakta 1", "fakta 2"],
  "new_events": [
     {"event": "Pengguna sedang kesal karena ban motornya bocor hari ini", "emotion": "sad"}
  ],
  "obsolete_fact_ids": [15, 23]
}
Jika tidak ada informasi baru tentang PENGGUNA, kembalikan {"new_facts":[],"new_events":[],"obsolete_fact_ids":[]}. Jangan berikan markdown block.`;

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
            : "Belum ada fakta yang tersimpan.";

        // Ambil 5 pesan terakhir untuk direnungkan
        // Fix 2: Filter konten assistant — strip catatan visual/embodiment yang hanya menjadi noise
        const recentChats = workingMemory.slice(-5).map(m => {
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
        
[FAKTA YANG SUDAH DIKETAHUI SEBELUMNYA TENTANG USER]
${existingFactsStr}

ATURAN KRITIS: JANGAN PERNAH memasukkan ulang fakta yang maknanya sama persis atau sudah tercakup dalam daftar di atas! Hanya ekstrak fakta yang BENAR-BENAR BARU.`;

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

        console.log(`[REFLECTION] Selesai merenungkan. ${content.new_facts?.length || 0} fakta baru, ${content.new_events?.length || 0} kejadian baru, ${content.obsolete_fact_ids?.length || 0} fakta dihapus.`);
    } catch (e) {
        console.error("Reflection Engine Exception:", e);
    }
}
