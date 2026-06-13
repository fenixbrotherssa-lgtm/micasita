const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function diagnosticoIA() {
    const apiKey = process.env.POLITICA_API_KEY;
    const modelTag = process.env.IA_MODEL_NAME;

    console.log("====================================================");
    console.log("🔍 DIAGNÓSTICO DE IA");
    console.log("====================================================");

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        // 🔹 1. LISTAR MODELOS
        console.log("⏳ Consultando modelos disponibles...");

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log("\n✅ MODELOS DISPONIBLES:");
            data.models.forEach(m => {
                console.log(`- ${m.name.replace('models/', '')}`);
            });
        } else {
            console.log("❌ No se pudieron listar modelos");
        }

        // 🔹 2. TEST REALISTA
        console.log("\n----------------------------------------------------");
        console.log(`⏳ Probando modelo: ${modelTag}`);

        const model = genAI.getGenerativeModel({
            model: modelTag,
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 100
            }
        });

        const prompt = `
Responde SOLO en JSON:
{ "ok": true }
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        console.log("✅ RESPUESTA:");
        console.log(text);

        console.log("\n🟢 CONCLUSIÓN: IA FUNCIONANDO");

    } catch (error) {

        console.log("\n❌ ERROR DETECTADO:");

        if (error.message.includes("429")) {
            console.log("🚨 SIN CUOTA (FREE TIER AGOTADO)");
        } 
        else if (error.message.includes("API key")) {
            console.log("🔑 API KEY INVÁLIDA");
        } 
        else if (error.message.includes("model")) {
            console.log("🤖 MODELO INCORRECTO");
        } 
        else {
            console.log("⚠️ ERROR GENERAL:");
            console.log(error.message);
        }
    }
}

diagnosticoIA();