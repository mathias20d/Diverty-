// Import the GoogleGenerativeAI library
const { GoogleGenerativeAI } = require("@google/generative-ai");

// This is the main function that Netlify will run
exports.handler = async function (event, context) {
  // --- Security Checks ---
  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405, // Method Not Allowed
      body: JSON.stringify({ error: "Only POST requests are allowed." }),
    };
  }

  // Get the Gemini API Key from Netlify's environment variables
  // This is the secure way to store your key!
  const API_KEY = process.env.GEMINI_API_KEY;

  // If the API key is missing, return an error
  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "API key is not configured." }),
    };
  }

  try {
    // Parse the data sent from your website (the chat history)
    const { chatHistory, generationConfig } = JSON.parse(event.body);

    // If there's no chat history, it's a bad request
    if (!chatHistory) {
        return {
            statusCode: 400, // Bad Request
            body: JSON.stringify({ error: "Missing chatHistory in request body." }),
        };
    }

    // Initialize the Google Generative AI client with your API key
    const genAI = new GoogleGenerativeAI(API_KEY);
    // Select the model you want to use
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: generationConfig // Pass the generationConfig here
    });

    // Start a chat session with the provided history
    const chat = model.startChat({
        history: chatHistory.slice(0, -1), // Send all but the last message
    });

    // Get the last user message to send to the API
    const lastMessage = chatHistory[chatHistory.length - 1].parts[0].text;

    // Send the message and wait for the result
    const result = await chat.sendMessage(lastMessage);
    const response = await result.response;
    const text = response.text();

    // Send the AI's response back to your website
    return {
      statusCode: 200,
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    };

  } catch (error) {
    // If anything goes wrong, log the error and send a generic error message
    console.error("Error calling Gemini API:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: { 
          message: "An error occurred while communicating with the AI. " + error.message 
        }
      }),
    };
  }
};
