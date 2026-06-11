import { setActiveGoal } from "../memory/working.mjs";

export const setGoalToolDefinition = {
    type: "function",
    function: {
        name: "set_goal",
        description: "Panggil alat ini secara proaktif untuk mengingat dan mencatat sebuah AGENDA atau MISI (misal: 'Interogasi user tentang hobi dan makanan favorit' atau 'Tanyakan 5 soal matematika beruntun'). Ini mencegahmu terdistraksi atau lupa topik saat ngobrol. Jangan panggil ini jika tidak ada seri obrolan spesifik.",
        parameters: {
            type: "object",
            properties: {
                goal_description: {
                    type: "string",
                    description: "Deskripsi misi yang spesifik dan jelas."
                }
            },
            required: ["goal_description"]
        }
    }
};

export const completeGoalToolDefinition = {
    type: "function",
    function: {
        name: "complete_goal",
        description: "Panggil alat ini jika misi atau agenda aktif yang sedang berjalan SUDAH SELESAI seluruhnya. Ini akan menghapus agenda dari pikiranmu agar kamu kembali santai.",
        parameters: {
            type: "object",
            properties: {}
        }
    }
};

import { saveWorkingMemory } from "../memory/working.mjs";

export async function executeSetGoalTool(args, context, services) {
    const { chatId, userId, history, systemPrompt, text, toolCall, message } = context;
    const { sendTelegram, queryLLMWithFallback } = services;
    const { goal_description } = args;
    
    await setActiveGoal(userId, goal_description);
    console.log(`[GOAL SET] User ${userId}: ${goal_description}`);
    
    const toolResponseMessages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
        { role: 'user', content: text },
        message,
        { role: 'tool', name: 'set_goal', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, message: "Goal set." }) }
    ];

    try {
        const followupData = await queryLLMWithFallback(systemPrompt, null, null, toolResponseMessages);
        const replyText = followupData.choices?.[0]?.message?.content || "Oke, ayo kita mulai!";
        await sendTelegram('sendMessage', { chat_id: chatId, text: replyText });
        await saveWorkingMemory(userId, 'assistant', replyText);
    } catch (e) {
        console.error("Set Goal Followup Error:", e);
    }
}

export async function executeCompleteGoalTool(args, context, services) {
    const { chatId, userId, history, systemPrompt, text, toolCall, message } = context;
    const { sendTelegram, queryLLMWithFallback } = services;
    
    await setActiveGoal(userId, null);
    console.log(`[GOAL COMPLETED] User ${userId}`);
    
    const toolResponseMessages = [
        { role: 'system', content: systemPrompt },
        ...(history || []).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
        { role: 'user', content: text },
        message,
        { role: 'tool', name: 'complete_goal', tool_call_id: toolCall.id, content: JSON.stringify({ success: true, message: "Goal cleared." }) }
    ];

    try {
        const followupData = await queryLLMWithFallback(systemPrompt, null, null, toolResponseMessages);
        const replyText = followupData.choices?.[0]?.message?.content || "Yey, akhirnya kelar juga!";
        await sendTelegram('sendMessage', { chat_id: chatId, text: replyText });
        await saveWorkingMemory(userId, 'assistant', replyText);
    } catch (e) {
        console.error("Complete Goal Followup Error:", e);
    }
}
