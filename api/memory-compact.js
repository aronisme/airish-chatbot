import { createClient } from "@supabase/supabase-js";
import { json, vercelHandler } from "../src/http.mjs";
import { queryChronosLLM } from "../src/llm.mjs";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "dummy_key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function handler(event) {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
        return json(405, { error: 'Method not allowed' });
    }

    console.log("[MEMORY-COMPACT] Memulai proses pemadatan memori semantik...");

    // 1. Ambil beberapa user aktif dari database (batch 10 user per eksekusi untuk efisiensi)
    const { data: users, error: userError } = await supabase.from('users').select('telegram_id').limit(10);
    if (userError || !users) {
        return json(500, { error: 'Gagal mengambil data users', details: userError });
    }

    const report = [];

    // 2. Loop setiap user
    for (const user of users) {
        const userId = user.telegram_id;
        
        // Ambil semua memori semantik (fakta) user ini
        const { data: memories } = await supabase.from('memories').select('id, fact').eq('telegram_id', userId);
        
        // Hanya lakukan pemadatan jika user memiliki lebih dari 10 memori agar efisien token
        if (memories && memories.length > 10) {
            console.log(`[MEMORY-COMPACT] User ${userId} memiliki ${memories.length} memori. Memadatkan...`);
            
            const existingFactsStr = memories.map((m, i) => `${i+1}. ${m.fact}`).join('\n');
            
            const prompt = `Kamu adalah sistem manajemen memori. Berikut adalah daftar fakta tentang user yang dikumpulkan dari waktu ke waktu.
Terdapat banyak fakta yang mirip, redundan, berulang-ulang, atau saling tumpang tindih.
Tugasmu:
1. Rangkum dan gabungkan fakta-fakta yang maknanya sama.
2. Pertahankan fakta-fakta spesifik yang unik (seperti nama film kesukaan, bahasa pemrograman, dll).
3. Hapus fakta yang saling bertentangan dengan mengambil fakta yang paling logis atau dominan.
4. Jangan menambahkan informasi baru apa pun.

Daftar Fakta Saat Ini:
${existingFactsStr}

Kembalikan HANYA format JSON MURNI tanpa blok markdown:
{
  "compacted_facts": ["fakta padat 1", "fakta padat 2", "fakta padat 3"]
}`;

            try {
                // Pakai Qwen3-32B dari Groq via llm.mjs (Gratis & Cepat)
                const res = await queryChronosLLM(prompt, "", true);
                let content = res.choices[0].message.content;
                content = content.replace(/```json/g, "").replace(/```/g, "").trim();
                
                const jsonRes = JSON.parse(content);
                const compacted = jsonRes.compacted_facts || [];
                
                if (compacted.length > 0 && compacted.length < memories.length) {
                    // Hapus semua memori lama untuk user ini
                    await supabase.from('memories').delete().eq('telegram_id', userId);
                    
                    // Masukkan memori baru yang sudah dipadatkan
                    for (const fact of compacted) {
                        await supabase.from('memories').insert({ telegram_id: userId, fact: fact });
                    }
                    
                    report.push(`User ${userId}: Dipadatkan dari ${memories.length} menjadi ${compacted.length} fakta.`);
                    console.log(`[MEMORY-COMPACT] Berhasil memadatkan user ${userId}.`);
                } else {
                    report.push(`User ${userId}: Tidak ada pemadatan yang signifikan (${compacted.length} fakta).`);
                }
                
            } catch (err) {
                console.error(`[MEMORY-COMPACT] Error memadatkan user ${userId}:`, err.message);
                report.push(`User ${userId}: Gagal - ${err.message}`);
            }
        } else {
            report.push(`User ${userId}: Memori masih sedikit (${memories?.length || 0}), diabaikan.`);
        }
    }

    return json(200, { ok: true, report });
}

export default vercelHandler(handler);
