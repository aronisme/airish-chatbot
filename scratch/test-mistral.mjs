import { queryChronosLLM } from "../src/llm.mjs";

async function run() {
    try {
        console.log("Testing Mistral by modifying llm.mjs locally...");
        // This is just a test of the function, the function will pick randomly.
        // We will loop until it picks Mistral, or just let it be.
        for (let i=0; i<10; i++) {
            const res = await queryChronosLLM("Beri saya response JSON", "", true);
            console.log(res.choices[0].message.content);
            break; // If it doesn't fail, we are good.
        }
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
run();
