import { photoToolDefinition, executePhotoTool } from './photo.mjs';
import { memoryToolDefinition, executeMemoryTool } from './memory.mjs';
import { analyzeImage } from './vision.mjs';

// Daftar semua definisi alat AI (Tools) yang dikirim ke LLM
export const AI_TOOLS = [
    photoToolDefinition,
    memoryToolDefinition
];

// Router untuk mengeksekusi alat yang dipicu oleh LLM
export async function executeTool(callName, args, context, services) {
    if (callName === 'generate_photo' || callName === 'generate_selfie') {
        return await executePhotoTool(args, context, services);
    }
    
    if (callName === 'save_memory') {
        return await executeMemoryTool(args, context, services);
    }
    
    return null;
}

export { analyzeImage };
