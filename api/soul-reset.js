import { json, vercelHandler, readJson } from "../src/http.mjs";
import redis from "../src/redis.mjs";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "dummy_key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return json(405, { error: 'Method not allowed' });
    }

    const body = readJson(event);
    if (!body || !body.user_id) {
        return json(400, { error: 'user_id is required' });
    }

    const userId = body.user_id;
    console.log(`[SOUL RESET] Menginisiasi penghapusan total untuk user ${userId}...`);

    try {
        // 1. Hapus memori jangka panjang dari Supabase (Semantic & Episodic)
        await supabase.from('memories').delete().eq('telegram_id', userId);
        await supabase.from('episodic_memories').delete().eq('telegram_id', userId);

        // 2. Hapus semua kunci psikologis dan memori jangka pendek dari Redis
        const keysToDelete = [
            `user:${userId}:working_memory`,
            `user:${userId}:soul_state`,
            `user:${userId}:trust_level`,
            `user:${userId}:baggage`,
            `user:${userId}:dossier`,
            `user:${userId}:self_narrative`,
            `user:${userId}:active_goal`
        ];

        // Karena Upstash Redis tidak mendung multi-delete (del) array secara langsung di client sederhana,
        // kita hapus satu persatu:
        for (const key of keysToDelete) {
            await redis.del(key);
        }

        console.log(`[SOUL RESET] Selesai. Entitas Airish terlahir kembali bagi user ${userId}.`);
        return json(200, { ok: true, message: 'Berhasil melakukan reset/membunuh entitas untuk user ini.' });

    } catch (error) {
        console.error("[SOUL RESET] Error:", error);
        return json(500, { error: error.message || 'Failed to reset soul' });
    }
}

export default vercelHandler(handler);
