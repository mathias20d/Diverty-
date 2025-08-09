// Este archivo va en: /netlify/functions/gemini.js

exports.handler = async function(event) {
    // Solo permite peticiones POST para seguridad
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    // Extrae los datos enviados desde la página web
    const { chatHistory, generationConfig } = JSON.parse(event.body);
    
    // Accede a la clave de API de forma segura desde las variables de entorno de Netlify
    const apiKey = process.env.GOOGLE_API_KEY;
    
    // Si la clave no está configurada en Netlify, devuelve un error claro
    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: { message: "API key not configured in Netlify." } })
        };
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const payload = {
        contents: chatHistory,
        generationConfig: generationConfig
    };

    try {
        // Llama a la API de Google desde el servidor de Netlify
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        // Si Google devuelve un error, lo pasamos a nuestra página web
        if (!response.ok) {
            console.error('Google API Error:', data);
            return {
                statusCode: response.status,
                body: JSON.stringify(data)
            };
        }

        // Si todo sale bien, devolvemos la respuesta de Google a nuestra página web
        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Proxy Function Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: { message: 'Failed to fetch from Google API via proxy.' } })
        };
    }
};
