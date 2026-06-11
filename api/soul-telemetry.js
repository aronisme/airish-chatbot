import redis from '../src/redis.mjs';
import { json, vercelHandler } from "../src/http.mjs";

async function handler(event) {
    if (event.httpMethod !== 'GET') {
        return json(405, { error: 'Method not allowed' });
    }

    // Ambil semua data soul dari Redis secara paralel
    const [embodimentStr, agendaStr, weatherStr] = await Promise.all([
        redis.get('soul:embodiment:global'),
        redis.get('soul:chronos:agenda'),
        redis.get('soul:chronos:weather')
    ]);

    const parse = (str) => {
        if (!str) return null;
        if (typeof str === 'object') return str;
        try { return JSON.parse(str); } catch { return str; }
    };

    const embodiment = parse(embodimentStr);
    const agenda = parse(agendaStr);
    const weather = typeof weatherStr === 'string' ? weatherStr : null;

    // Cari semua user soul_state (ambil max 10 user)
    // Karena Upstash tidak support SCAN dengan mudah, kita ambil dari Supabase users
    let userStates = [];
    try {
        // Ambil userId dari settings atau hardcode scan
        // Untuk efisiensi, kita cek key pattern yang umum
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
            process.env.SUPABASE_URL || "https://dummy.supabase.co",
            process.env.SUPABASE_ANON_KEY || "dummy_key"
        );
        const { data: users } = await supabase.from('users').select('telegram_id').limit(10);
        if (users) {
            for (const user of users) {
                const [stateStr, promptStr] = await Promise.all([
                    redis.get(`user:${user.telegram_id}:soul_state`),
                    redis.get(`user:${user.telegram_id}:last_system_prompt`)
                ]);
                const state = parse(stateStr);
                if (state) {
                    userStates.push({
                        telegram_id: user.telegram_id,
                        last_system_prompt: promptStr || null,
                        ...state
                    });
                }
            }
        }
    } catch (e) {
        console.error("Failed to fetch user states:", e);
    }

    return json(200, {
        ok: true,
        embodiment,
        agenda,
        weather,
        userStates
    });
}

export default vercelHandler(handler);
