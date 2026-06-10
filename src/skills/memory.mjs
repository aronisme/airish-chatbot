import { saveWorkingMemory } from '../memory/working.mjs';

export const memoryToolDefinition = {
    type: "function",
    function: {
        name: "save_memory",
        description: "HANYA panggil alat ini JIKA pengguna memberikan informasi atau fakta baru yang penting tentang diri mereka yang harus kamu ingat (misalnya: nama hewan peliharaan, ulang tahun, kesukaan, dll).",
        parameters: {
            type: "object",
            properties: {
                fact: { type: "string", description: "Fakta penting tentang pengguna yang harus disimpan." },
                event_date: { type: "string", description: "Tanggal kejadian (YYYY-MM-DD) jika disebutkan. Jika tidak, kosongkan saja." }
            },
            required: ["fact"]
        }
    }
};

export async function executeMemoryTool(args, context, services) {
    const { chatId, userId, history, systemPrompt, text, toolCall, message } = context;
    const { sendTelegram, supabase, queryLLMWithFallback } = services;

    const fact = args.fact;
    await supabase.from('memories').insert({ telegram_id: userId, fact: fact, event_date: args.event_date || null });
    
    // Follow up to AI to acknowledge the memory save
    const toolResponseMessages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
        { role: 'user', content: text },
        message,
        { role: 'tool', name: 'save_memory', tool_call_id: toolCall.id, content: JSON.stringify({ success: true }) }
    ];

    try {
        const followupData = await queryLLMWithFallback(systemPrompt, null, null, toolResponseMessages);
        const replyText = followupData.choices?.[0]?.message?.content || "Memori telah disimpan!";
        await sendTelegram('sendMessage', { chat_id: chatId, text: replyText });
        await saveWorkingMemory(userId, 'assistant', replyText);
    } catch (e) {
        await sendTelegram('sendMessage', { chat_id: chatId, text: "Fakta sudah kuingat ya!" });
    }
}
