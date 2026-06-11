import redis from '../src/redis.mjs';
import { json, vercelHandler } from "../src/http.mjs";
import { createClient } from "@supabase/supabase-js";
import { queryLLMWithFallback } from "../src/llm.mjs";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "dummy_key";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function handler(event) {
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
        return json(405, { error: 'Method not allowed' });
    }

    const now = new Date();

    // --- MENCATAT TRIGGER KE DALAM gas.html ---
    try {
        const logEntry = {
            type: 'incoming',
            timestamp: now.toISOString(),
            headers: event.headers,
            body: event.body || {},
            query: event.queryStringParameters || {},
            note: "Chronos Triggered by GAS"
        };
        await redis.lpush('gas:testing:logs', JSON.stringify(logEntry));
        await redis.ltrim('gas:testing:logs', 0, 49);
    } catch (err) {
        console.error("Failed to log for gas.html", err);
    }

    // Cek setting untuk timezone / base city
    const settingsStr = await redis.get('soul:settings:global');
    const settings = settingsStr ? (typeof settingsStr === 'string' ? JSON.parse(settingsStr) : settingsStr) : { proactive: true, homeCity: "Jakarta" };

    const hour = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", hour: "numeric", hour12: false });
    const currentHour = parseInt(hour, 10);
    const dateStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", dateStyle: "full" });
    const timeStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta", timeStyle: "short" });

    let timeOfDay = "Siang";
    if (currentHour >= 0 && currentHour < 5) timeOfDay = "Dini Hari";
    else if (currentHour >= 5 && currentHour < 10) timeOfDay = "Pagi";
    else if (currentHour >= 10 && currentHour < 15) timeOfDay = "Siang";
    else if (currentHour >= 15 && currentHour < 18) timeOfDay = "Sore";
    else if (currentHour >= 18 && currentHour <= 23) timeOfDay = "Malam";

    // Mengambil Cuaca Asli secara Real-Time (Tanpa API Key, Cache 1 Jam di Redis)
    let weather = "Cerah"; 
    try {
        let cachedWeather = await redis.get('soul:chronos:weather');
        if (cachedWeather) {
            weather = cachedWeather;
        } else {
            const city = encodeURIComponent(settings.homeCity || "Jakarta");
            // %C = Kondisi (Clear, Rain), %t = Temperatur (+28°C)
            const weatherRes = await fetch(`https://wttr.in/${city}?format=%C+%t`);
            if (weatherRes.ok) {
                weather = await weatherRes.text();
                await redis.set('soul:chronos:weather', weather, { ex: 3600 }); // Simpan 1 jam agar tidak spam API
            }
        }
    } catch (e) {
        console.error("Gagal mengambil cuaca:", e);
    }
    
    // TAHAP 5: The Morning Routine (Bikin Jadwal jam 06:00)
    let agendaStr = await redis.get('soul:chronos:agenda');
    let agenda = agendaStr ? (typeof agendaStr === 'string' ? JSON.parse(agendaStr) : agendaStr) : null;
    let isMorning = currentHour === 6 && (!agenda || agenda.date !== dateStr);

    if (isMorning || !agenda) {
        console.log("[CHRONOS] Running Morning Routine to generate agenda...");
        const prompt = `Buatlah agenda kegiatan harian secara singkat untuk gadis bernama Airish hari ini (${dateStr}). 
Airish adalah seorang mahasiswi/pekerja freelance. 
Tentukan juga pakaian (outfit) apa yang ia kenakan hari ini.
Kembalikan HANYA dalam format JSON dengan key: "agenda" (string singkat) dan "outfit" (string singkat).`;
        
        try {
            const llmRes = await queryLLMWithFallback(prompt, [], "", null, true);
            const resJson = JSON.parse(llmRes.choices[0].message.content);
            agenda = {
                date: dateStr,
                agenda: resJson.agenda || "Sibuk nugas",
                outfit: resJson.outfit || "Kaos oblong"
            };
            await redis.set('soul:chronos:agenda', JSON.stringify(agenda));
        } catch (e) {
            console.error("Morning Routine LLM Error:", e);
            agenda = { date: dateStr, agenda: "Hari yang santai", outfit: "Pakaian rumah yang nyaman" };
        }
    }

    // TAHAP 6: The 15-Min Pulse (Aliran Kesadaran)
    let lastStateStr = await redis.get('soul:embodiment:global');
    let lastState = lastStateStr ? (typeof lastStateStr === 'string' ? JSON.parse(lastStateStr) : lastStateStr) : {};

    console.log("[CHRONOS] Running 15-Min Pulse (Inner Monologue)...");
    const pulsePrompt = `Namamu Airish. Kamu berada di ${settings.homeCity}. Waktu saat ini: ${timeStr} (${timeOfDay}). Cuaca: ${weather}.
Agenda utamamu hari ini: ${agenda.agenda}. Pakaianmu: ${agenda.outfit}.
Beberapa saat yang lalu kamu sedang: "${lastState.current_activity || 'Tidur'}".

Tugasmu: Tentukan apa yang sedang kamu lakukan TEPAT DETIK INI. Di mana kamu? Dan apa yang sedang kamu pikirkan (inner thought) di dalam hati?
Kembalikan HANYA format JSON dengan struktur persis seperti ini:
{
  "location": "lokasi spesifik",
  "activity": "aktivitas detik ini secara spesifik",
  "inner_thought": "pikiran di dalam hati, keluhan, atau opini"
}`;

    let newState = { time_of_day: timeOfDay, weather: weather, current_activity: "Melamun", inner_thought: "Aku bingung mau ngapain.", location: "Kamar", last_updated: now.getTime() };
    
    try {
        const pulseRes = await queryLLMWithFallback(pulsePrompt, [], "", null, true);
        let content = pulseRes.choices[0].message.content;
        
        // Antisipasi Mistral mengembalikan markdown ```json
        content = content.replace(/```json/g, "").replace(/```/g, "").trim();
        
        const pulseJson = JSON.parse(content);
        newState = {
            ...newState,
            location: pulseJson.location || "Kamar",
            current_activity: pulseJson.activity || "Rebahan santai",
            inner_thought: pulseJson.inner_thought || "Hari yang damai.",
            outfit: agenda.outfit,
            agenda: agenda.agenda
        };
        await redis.set('soul:embodiment:global', JSON.stringify(newState));
    } catch (e) {
        console.error("Pulse LLM Error:", e);
        await redis.set('soul:embodiment:global', JSON.stringify(newState));
    }

    // --- PROACTIVE ENGINE CHECK ---
    if (settings.proactive && timeOfDay !== "Dini Hari") {
        const { data: users } = await supabase.from('users').select('telegram_id').limit(5);
        if (users) {
            for (const user of users) {
                const userId = user.telegram_id;
                const userStateStr = await redis.get(`user:${userId}:soul_state`);
                const userState = userStateStr ? (typeof userStateStr === 'string' ? JSON.parse(userStateStr) : userStateStr) : null;
                
                if (userState && userState.desires && userState.desires.connection > 0.9) {
                    const isWaiting = await redis.get(`user:${userId}:waiting_reply`);
                    if (!isWaiting) {
                        console.log(`[PROACTIVE] User ${userId} kangen! Menyiapkan chat duluan...`);
                        
                        // Menjalankan LLM untuk menulis pesan proaktif
                        const proPrompt = `Kamu adalah Airish. Saat ini kamu sedang ${newState.current_activity} di ${newState.location}.
Pikiran batinmu: "${newState.inner_thought}". 
Kamu sangat kangen dengan seorang teman yang sudah lama tidak chat. 
Tulis pesan pendek (1-2 kalimat) untuk menyapanya secara natural (WA style). Jangan terlalu formal!`;
                        
                        try {
                            const proRes = await queryLLMWithFallback(proPrompt, [], "");
                            const proMessage = proRes.choices[0].message.content;
                            console.log(`[PROACTIVE MESSAGE] -> ${proMessage}`);
                            
                            // Eksekusi kirim pesan via Telegram
                            const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
                            if (BOT_TOKEN) {
                                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ chat_id: userId, text: proMessage })
                                });
                            }
                            
                        } catch(e) {
                            console.error("Proactive LLM or Telegram Error:", e);
                        }
                        
                        // Set waiting state selama 24 jam
                        await redis.set(`user:${userId}:waiting_reply`, "1", { ex: 86400 }); 
                    }
                }
            }
        }
    }

    return json(200, { ok: true, state: newState, message: "God Mode Chronos Pulse executed successfully" });
}

export default vercelHandler(handler);
