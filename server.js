const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(express.json());

const { EVOLUTION_API_URL, EVOLUTION_API_KEY, INSTANCE_NAME, GEMINI_API_KEY, SYSTEM_PROMPT } = process.env;

// Initialize Gemini AI via the official Google SDK
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.0-flash-preview' });

// Incoming Messages from Evolution API Webhook
app.get('/', (req, res) => res.sendStatus(200));
app.post('/webhook', async (req, res) => {
    // Immediately return 200 OK to Evolution API to prevent timeout polling
    res.sendStatus(200);

    const body = req.body;
    
    // Only capture and respond to new, incoming user messages (avoiding loops and status updates)
    if (body.event === 'messages.upsert' && !body.data.key.fromMe) {
        const remoteJid = body.data.key.remoteJid;
        const messageData = body.data.message;
        
        // Safely extract text depending on how Evolution parses standard vs extended messages
        const text = messageData?.conversation || messageData?.extendedTextMessage?.text || '';
        
        if (!text) return; // Skip non-text media messages
        
        console.log('Received message from', remoteJid, ':', text);
        
        try {
            // Pull personality from environment variables, or use the default
            const personality = SYSTEM_PROMPT || 'You are a friendly, helpful, and concise conversational WhatsApp assistant.';
            
            // Generate a natural language response using Gemini 1.5 Flash
            const prompt = `System Instructions: ${personality}\n\nUser message: ${text}\n\nPlease write a conversational reply matching your exact instructions:`;
            const result = await aiModel.generateContent(prompt);
            const aiResponse = result.response.text();

            // Fire an HTTP POST back into Evolution API's sendText endpoint
            await axios.post(
                `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`,
                {
                    number: remoteJid,
                    options: { delay: 1200, presence: 'composing' },
                    textMessage: { text: aiResponse }
                },
                { 
                    headers: { 
                        'apikey': EVOLUTION_API_KEY,
                        'Content-Type': 'application/json'
                    } 
                }
            );
            console.log('Gemini AI successfully dispatched a reply!');
        } catch (err) {
            console.error('Error generating AI text or hitting Evolution API:', err.message);
        }
    }
});

// Start listening for webhooks
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('Evolution API Webhook actively listening on port', PORT));
