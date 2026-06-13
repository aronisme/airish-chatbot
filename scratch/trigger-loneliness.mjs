import { createClient } from "@supabase/supabase-js";
import redis from "../src/redis.mjs";
import chronos from "../api/chronos.js";

async function run() {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: users } = await supabase.from('users').select('telegram_id').limit(5);
    
    await redis.del('soul:chronos:active_context');
    await redis.set('soul:chronos:force_awake', '1', { ex: 300 });

    if (users) {
        for (const user of users) {
            const userId = user.telegram_id;
            
            // Sahabat dekat (0.9)
            await redis.set(`user:${userId}:trust_level`, "0.9");
            
            // Hapus dendam
            await redis.del(`user:${userId}:baggage`);
            
            // Hapus cooldown
            await redis.del(`user:${userId}:waiting_reply`);
            
            // Kangen maksimal
            const stateStr = await redis.get(`user:${userId}:soul_state`);
            let state = {};
            try {
                if (typeof stateStr === 'string' && stateStr !== '[object Object]') {
                    state = JSON.parse(stateStr);
                } else if (typeof stateStr === 'object' && stateStr !== null) {
                    state = stateStr;
                }
            } catch (e) {}
            if (!state.desires) state.desires = {};
            state.desires.connection = 0.95; 
            await redis.set(`user:${userId}:soul_state`, JSON.stringify(state));
            
            console.log(`[SCRATCH] Sengaja memicu kangen maksimal (Sindrom Kesepian) untuk ${userId}...`);
        }
    }
    
    const req = {method: 'POST', headers: {}, body: {}};
    const res = {status: () => res, send: () => {}};
    console.log("[SCRATCH] Menjalankan Chronos (Pulse)...");
    try {
        await chronos(req, res);
    } catch(e) {}
    console.log("[SCRATCH] Selesai! Cek Telegram.");
}
run();
