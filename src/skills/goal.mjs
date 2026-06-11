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

export async function executeSetGoalTool(args, context) {
    const { userId } = context;
    const { goal_description } = args;
    await setActiveGoal(userId, goal_description);
    console.log(`[GOAL SET] User ${userId}: ${goal_description}`);
    return { status: "success", message: `Agenda aktif berhasil di-set: "${goal_description}". Jangan lupa panggil complete_goal jika sudah selesai.` };
}

export async function executeCompleteGoalTool(args, context) {
    const { userId } = context;
    await setActiveGoal(userId, null);
    console.log(`[GOAL COMPLETED] User ${userId}`);
    return { status: "success", message: "Agenda telah selesai dan dihapus. Kembali ke mode ngobrol santai bebas." };
}
