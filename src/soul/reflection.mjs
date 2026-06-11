// src/soul/reflection.mjs
import { saveEpisodicMemory } from "../memory/episodic.mjs";

function getRandomGroqKey() {
    const groqKeys = (process.env.GROQ_KEYS || "").split(',').map(k => k.trim()).filter(Boolean);
    if (groqKeys.length === 0) return "";
    return groqKeys[Math.floor(Math.random() * groqKeys.length)];
}

const REFLECTION_PROMPT = `Kamu adalah mesin introspeksi psikologis. 
Tugasmu menganalisis transkrip percakapan antara 'user' (manusia) dan 'assistant' (bot/AI).
Tugas utamamu HANYA mengekstrak fakta penting baru atau kejadian spesifik TENTANG USER.

ATURAN KRITIS (BACA BAIK-BAIK):
1. 'user' adalah manusia (pengguna). 'assistant' adalah dirimu sendiri (bot).
2. DILARANG KERAS mengekstrak fakta, cerita, perilaku, atau aksi yang dilakukan oleh 'assistant'. Jika 'assistant' berkata "aku lagi santai di kos" atau "ini fotoku", JANGAN mencatatnya sebagai fakta user!
3. HANYA ekstrak fakta yang diceritakan oleh 'user' tentang dirinya sendiri.

Output harus format JSON murni:
{
  "new_facts": ["fakta 1", "fakta 2"], // Fakta STATIS/PERMANEN (contoh: Punya anjing bernama Budi, Punya motor). JANGAN masukkan masalah sementara.
  "new_events": [
     {"event": "User sedang kesal karena ban motornya bocor hari ini", "emotion": "sad"} // Kejadian DINAMIS/SEMENTARA atau insiden spesifik.
  ],
  "obsolete_fact_ids": [15, 23] // Jika ada [ID] fakta di daftar sebelumnya yang sudah TIDAK BENAR/KADALUARSA (misal: "Ban bocor" padahal user bilang sudah diperbaiki).
}
Jika tidak ada informasi yang penting untuk diingat tentang USER, kembalikan array kosong []. Jangan berikan markdown block.`;

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
        const recentChats = workingMemory.slice(-5);
        const conversationString = recentChats.map(m => `${m.role}: ${m.content}`).join('\n');
        
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
        if (content.new_facts && content.new_facts.length > 0) {
            for (const fact of content.new_facts) {
                await supabase.from('memories').insert({ telegram_id: userId, fact: fact });
            }
        }
        
        // 2. Simpan kejadian ke Episodic Memory (tabel pgvector baru)
        if (content.new_events && content.new_events.length > 0) {
            for (const ev of content.new_events) {
                await saveEpisodicMemory(supabase, userId, ev.event, ev.emotion);
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
