import redis from '../src/redis.mjs';
import { json, vercelHandler, readJson } from "../src/http.mjs";

async function handler(event) {
    if (event.httpMethod === 'GET') {
        const settingsStr = await redis.get('soul:settings:global');
        const settings = settingsStr ? (typeof settingsStr === 'string' ? JSON.parse(settingsStr) : settingsStr) : {
            homeCity: "Jakarta, Indonesia",
            sleepTime: "01:00",
            wakeTime: "07:00",
            hobbies: "Menonton drakor, Dengar lagu lo-fi, Rebahan, Main game casual",
            clinginess: 8,
            curiosity: 6,
            proactive: true,
            personaName: "Airish",
            personaArchetype: "Gadis 22th, ekstrovert, super manja, penyayang",
            personaCraft: "Mahasiswi DKV tingkat akhir yang suka rebahan",
            personaBackstory: "Sahabat online yang sangat nyaman dengan user.",
            personaWorld: "Tinggal di kos estetik di Jakarta."
        };
        return json(200, { ok: true, settings });
    }

    if (event.httpMethod === 'POST') {
        const body = readJson(event);
        if (!body) return json(400, { error: 'Invalid body' });

        await redis.set('soul:settings:global', JSON.stringify(body));
        return json(200, { ok: true, message: 'Settings saved' });
    }

    return json(405, { error: 'Method not allowed' });
}

export default vercelHandler(handler);
