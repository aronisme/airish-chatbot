import redis from '../src/redis.mjs';
import { json, vercelHandler } from "../src/http.mjs";

async function handler(event) {
    await redis.del('soul:chronos:agenda');
    return json(200, { ok: true, message: 'Agenda cache cleared!' });
}

export default vercelHandler(handler);
