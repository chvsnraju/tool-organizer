import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// Simple .env parser since we can't depend on dotenv
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    const env = {};
    content.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        env[key] = value;
      }
    });
    return env;
  } catch (e) {
    console.error("Could not read .env file at:", path.resolve(process.cwd(), '.env'));
    return {};
  }
}

async function listModels() {
  const env = loadEnv();
  const apiKey = env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.error("No VITE_GEMINI_API_KEY found in .env. Keys found:", Object.keys(env));
    process.exit(1);
  }

  console.log("Using API Key:", apiKey.substring(0, 5) + "...");

  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    // There isn't a direct "listModels" on the client instance usually easily accessible in this version of SDK in node 
    // unless getting the modelManager.
    // Let's just try to generate content with a few basic models to see which one works.
    
    const candidates = [
        "gemini-1.5-flash", 
        "gemini-1.5-flash-001",
        "gemini-1.5-pro",
        "gemini-pro-vision"
    ];

    console.log("Testing models...");

    for (const modelName of candidates) {
        process.stdout.write(`Testing ${modelName}... `);
        try {
            const m = genAI.getGenerativeModel({ model: modelName });
             // Test prompt
            await m.generateContent("Hello");
            console.log("✅ OK");
        } catch (e) {
            console.log("❌ Failed: " + e.message.split('[')[0]); // Simple error logging
        }
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

listModels();
