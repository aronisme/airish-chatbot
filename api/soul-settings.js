import { createClient } from "@supabase/supabase-js";
import { json, vercelHandler, readJson } from "../src/http.mjs";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function handler(event) {
    if (event.httpMethod === 'GET') {
        const { data: persona } = await supabase.from('personas').select('*').limit(1).single();
        const settings = persona ? {
            homeCity: persona.home_city || "Jakarta, Indonesia",
            sleepTime: persona.sleep_time || "01:00",
            wakeTime: persona.wake_time || "07:00",
            hobbies: persona.hobbies || "Menonton drakor, Dengar lagu lo-fi, Rebahan, Main game casual",
            clinginess: persona.clinginess !== null ? persona.clinginess : 8,
            curiosity: persona.curiosity !== null ? persona.curiosity : 6,
            proactive: persona.proactive !== null ? persona.proactive : true,
            personaName: persona.name || "Airish",
            personaArchetype: persona.archetype || "Gadis 22th, ekstrovert, super manja, penyayang",
            personaCraft: persona.craft || "Mahasiswi DKV tingkat akhir yang suka rebahan",
            personaBackstory: persona.backstory || "Sahabat online yang sangat nyaman dengan user.",
            personaWorld: persona.world_context || "Tinggal di kos estetik di Jakarta.",
            psychology: persona.psychology || null
        } : {
            homeCity: "Jakarta, Indonesia",
            sleepTime: "01:00",
            wakeTime: "07:00",
            hobbies: "Menonton drakor, Dengar lagu lo-fi, Rebahan",
            clinginess: 8,
            curiosity: 6,
            proactive: true,
            personaName: "Airish",
            personaArchetype: "Gadis 22th, ekstrovert",
            personaCraft: "Mahasiswi DKV",
            personaBackstory: "Sahabat online",
            personaWorld: "Kos estetik di Jakarta"
        };
        return json(200, { ok: true, settings });
    }

    if (event.httpMethod === 'POST') {
        const body = readJson(event);
        if (!body) return json(400, { error: 'Invalid body' });

        const payload = {
            home_city: body.homeCity,
            sleep_time: body.sleepTime,
            wake_time: body.wakeTime,
            hobbies: body.hobbies,
            clinginess: body.clinginess,
            curiosity: body.curiosity,
            proactive: body.proactive,
            name: body.personaName,
            archetype: body.personaArchetype,
            craft: body.personaCraft,
            backstory: body.personaBackstory,
            world_context: body.personaWorld,
            psychology: body.psychology,
            updated_at: new Date().toISOString()
        };

        const { data: existing } = await supabase.from('personas').select('id').limit(1).single();
        if (existing) {
            await supabase.from('personas').update(payload).eq('id', existing.id);
        } else {
            await supabase.from('personas').insert(payload);
        }

        return json(200, { ok: true, message: 'Settings saved to Supabase' });
    }

    return json(405, { error: 'Method not allowed' });
}

export default vercelHandler(handler);
