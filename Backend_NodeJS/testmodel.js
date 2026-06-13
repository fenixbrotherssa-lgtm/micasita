const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.POLITICA_API_KEY);

async function listModels() {
    try {
        // Usamos fetch directo a la API de Google para listar modelos
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.POLITICA_API_KEY}`);
        const data = await response.json();
        
        console.log("--- MODELOS DISPONIBLES EN TU CUENTA ---");
        if (data.models) {
            data.models.forEach(m => {
                console.log(`- ID: ${m.name.split('/')[1]}`);
                console.log(`  Descripción: ${m.description}`);
            });
        } else {
            console.log("No se pudieron listar los modelos. Revisa tu API Key.");
        }
    } catch (e) {
        console.error("Error conectando con Google:", e);
    }
}

listModels();