import { photoToolDefinition, executePhotoTool } from './photo.mjs';
import { memoryToolDefinition, executeMemoryTool } from './memory.mjs';
import { setGoalToolDefinition, completeGoalToolDefinition, executeSetGoalTool, executeCompleteGoalTool } from './goal.mjs';
import { analyzeImage } from './vision.mjs';
import { holdEmotionDefinition, releaseEmotionDefinition, executeHoldEmotionTool, executeReleaseEmotionTool } from './emotion.mjs';

// Daftar semua definisi alat AI (Tools) yang dikirim ke LLM
export const AI_TOOLS = [
    photoToolDefinition,
    memoryToolDefinition,
    setGoalToolDefinition,
    completeGoalToolDefinition,
    holdEmotionDefinition,
    releaseEmotionDefinition
];

// Router untuk mengeksekusi alat yang dipicu oleh LLM
export async function executeTool(callName, args, context, services) {
    if (callName === 'generate_photo' || callName === 'generate_selfie') {
        return await executePhotoTool(args, context, services);
    }
    
    if (callName === 'save_memory') {
        return await executeMemoryTool(args, context, services);
    }

    if (callName === 'set_goal') {
        return await executeSetGoalTool(args, context, services);
    }

    if (callName === 'complete_goal') {
        return await executeCompleteGoalTool(args, context, services);
    }
    
    if (callName === 'hold_emotion') {
        return await executeHoldEmotionTool(args, context, services);
    }

    if (callName === 'release_emotion') {
        return await executeReleaseEmotionTool(args, context, services);
    }

    return null;
}

export { analyzeImage };
