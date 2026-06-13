import { queryMistral, queryQwen, queryGroq } from "../src/llm.mjs";

async function testModel(name, fn, ...args) {
    console.log(`[TEST] Mencegah koneksi ke ${name}...`);
    try {
        const start = Date.now();
        const res = await fn(...args);
        const duration = Date.now() - start;
        const reply = res.choices?.[0]?.message?.content || "No message content";
        console.log(`[🟢 SUCCESS] ${name} aktif dalam ${duration}ms!`);
        console.log(`   Response singkat: "${reply.trim().replace(/\n/g, ' ').substring(0, 60)}..."\n`);
        return true;
    } catch (e) {
        console.error(`[🔴 FAILED] ${name} ERROR: ${e.message}\n`);
        return false;
    }
}

async function runTests() {
    console.log("=== MEMULAI PENGUJIAN SEMUA MODEL LLM ===\n");

    const prompt = "Sapa saya dengan kata 'Halo' saja.";

    // 1. Test Mistral Large
    await testModel("Mistral Large", queryMistral, prompt, [], "", null, false);

    // 2. Test Qwen Turbo
    await testModel("Qwen Turbo", queryQwen, prompt, [], "", null, false);

    // 3. Test Groq Llama 3.3 70B
    await testModel("Groq Llama 3.3 70B", queryGroq, prompt, "", false, "llama-3.3-70b-versatile");

    // 4. Test Groq Llama 3.1 8B
    await testModel("Groq Llama 3.1 8B", queryGroq, prompt, "", false, "llama-3.1-8b-instant");

    console.log("=== PENGUJIAN SELESAI ===");
    process.exit(0);
}

runTests();
