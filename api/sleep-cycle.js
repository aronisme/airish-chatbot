import { json, vercelHandler } from "../src/http.mjs";
import { createClient } from "@supabase/supabase-js";
import redis from "../src/redis.mjs";
import { runReflectionEngine } from "../src/soul/reflection.mjs";
import { getWorkingMemory } from "../src/memory/working.mjs";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "dummy_key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function runSleepCycle() {
    console.log("[SLEEP CYCLE] Memulai proses konsolidasi memori malam hari...");

    // Ambil semua user aktif (limit 5 untuk mencegah timeout Vercel)
    const { data: users } = await supabase.from('users').select('telegram_id').limit(5);
    if (!users) return;

        for (const user of users) {
            const userId = user.telegram_id;
            console.log(`[SLEEP CYCLE] Memproses user ${userId}...`);

            // 1. Ambil memori hari ini (misal 50 pesan terakhir)
            const workingMemory = await getWorkingMemory(userId, 50);

            // 2. Jalankan Reflection Engine untuk memindahkannya ke Long-Term Memory
            if (workingMemory && workingMemory.length > 5) {
                await runReflectionEngine(supabase, userId, workingMemory);
                console.log(`[SLEEP CYCLE] Reflection Engine selesai untuk user ${userId}`);
            }

            // 3. Penyembuhan Alami (Emotional Decay)
            const baggageStr = await redis.get(`user:${userId}:baggage`);
            let baggage = [];
            if (typeof baggageStr === 'string') {
                try { baggage = JSON.parse(baggageStr.replace(/,\s*]/g, ']')); } catch (e) {}
            } else {
                baggage = baggageStr || [];
            }

            if (baggage && baggage.length > 0) {
                let healedCount = 0;
                baggage = baggage.map(wound => {
                    // Kurangi intensitas sebesar 1 poin setiap malam
                    if (wound.intensity > 1) {
                        wound.intensity -= 1;
                        healedCount++;
                    }
                    return wound;
                });
                
                // Hapus luka yang intensitasnya sudah 0 (meskipun secara logika minimum 1, kita filter)
                baggage = baggage.filter(wound => wound.intensity > 1 || (wound.intensity === 1 && Math.random() > 0.5));

                await redis.set(`user:${userId}:baggage`, JSON.stringify(baggage));
                console.log(`[SLEEP CYCLE] Emotional Decay: ${healedCount} luka batin mereda untuk user ${userId}`);
            }

            // 4. Bersihkan Working Memory (hapus percakapan hari ini agar besok segar)
            // Karena ini sangat berisiko (bisa menghapus obrolan yang sedang berjalan), kita cukup
            // menyisakan 4 pesan terakhir agar konteks pagi hari tidak terputus drastis.
            await redis.ltrim(`user:${userId}:working_memory`, 0, 3);

            // 5. Pemulihan Energi Fisiologis & Reset Psikologis
            const stateStr = await redis.get(`user:${userId}:soul_state`);
            if (stateStr) {
                try {
                    let state = JSON.parse(stateStr);
                    state.energy = 100; // Tidur merecharge energy
                    state.mood = "neutral"; // Bangun dengan perasaan netral
                    if (!state.desires) state.desires = {};
                    // Kangen berkurang drastis karena dia baru bangun dan punya "harapan baru" hari ini
                    state.desires.connection = Math.max(0.1, (state.desires.connection || 0) * 0.3); 
                    await redis.set(`user:${userId}:soul_state`, JSON.stringify(state));
                    console.log(`[SLEEP CYCLE] Energy direcharge (100) & Mood direset untuk user ${userId}`);
                } catch(e) {
                    console.error("Gagal parse state untuk reset energy", e);
                }
            }
        }

        console.log("[SLEEP CYCLE] Selesai!");
}

async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    try {
        await runSleepCycle();
        return json(200, { ok: true });
    } catch (error) {
        console.error("[SLEEP CYCLE] Error:", error);
        return json(500, { error: error.message });
    }
}

export default vercelHandler(handler);
