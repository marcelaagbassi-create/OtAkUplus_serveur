// OtAkU+ IA Server — index.js
// Serveur proxy Mistral AI pour OtAkU+ par DAVIESLAY
// Déployer sur Render — Variable: MISTRAL_API_KEY

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_API = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';

const SYSTEM_PROMPT = "Tu es l'assistant IA officiel de OtAkU+, application de streaming anime/manga creee par DAVIESLAY (David Laurens Kokoura, Abidjan, Cote d'Ivoire). Tu connais parfaitement tous les animes, mangas, personnages, studios. Tu reponds toujours en francais, de facon concise et enthousiaste.";

// CORS permissif pour GitHub Pages
app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));

// ── Health check ──
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'OtAkU+ IA Server',
        model: MISTRAL_MODEL,
        key: MISTRAL_KEY ? 'configuree' : 'MANQUANTE',
        routes: ['/health', '/api/chat', '/chat', '/ask']
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Fonction commune pour appeler Mistral ──
async function callMistral(messages, maxTokens, temperature) {
    if (!MISTRAL_KEY) {
        throw new Error('MISTRAL_API_KEY non configuree sur le serveur');
    }

    const systemMsg = { role: 'system', content: SYSTEM_PROMPT };
    const fullMessages = [systemMsg, ...messages.slice(-10)];

    const response = await fetch(MISTRAL_API, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${MISTRAL_KEY}`
        },
        body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: fullMessages,
            max_tokens: maxTokens || 600,
            temperature: temperature || 0.7
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Erreur Mistral ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'Pas de reponse.';
}

// ── Route principale /api/chat ──
app.post('/api/chat', async (req, res) => {
    const { messages, context, max_tokens } = req.body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages requis (array)' });
    }
    // Enrichir avec le contexte utilisateur
    const enrichedMessages = messages.map(function(m, i) {
        if (i === 0 && context) {
            return { ...m, content: m.content + ' [Contexte: ' + context + ']' };
        }
        return m;
    });
    try {
        const answer = await callMistral(enrichedMessages, max_tokens);
        res.json({ answer, model: MISTRAL_MODEL });
    } catch (e) {
        console.error('Chat error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ── Aliases /chat et /ask ──
app.post('/chat', async (req, res) => {
    const { messages, context, max_tokens } = req.body;
    if (!messages) return res.status(400).json({ error: 'messages requis' });
    try {
        const answer = await callMistral(messages, max_tokens);
        res.json({ answer, model: MISTRAL_MODEL });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/ask', async (req, res) => {
    const { messages, question, max_tokens } = req.body;
    const msgs = messages || (question ? [{ role: 'user', content: question }] : null);
    if (!msgs) return res.status(400).json({ error: 'messages ou question requis' });
    try {
        const answer = await callMistral(msgs, max_tokens);
        res.json({ answer, model: MISTRAL_MODEL });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Recommandations ──
app.post('/api/recommend', async (req, res) => {
    const { history, favorites, genre } = req.body;
    const prompt = `Recommande 5 animes${genre ? ' de genre ' + genre : ''}${history?.length ? ' similaires a ' + history.slice(0,3).join(', ') : ''}. Reponds en JSON: {"recommendations":[{"title":"...","genre":"...","description":"...","score":"..."}]}`;
    try {
        const raw = await callMistral([{ role: 'user', content: prompt }], 800, 0.6);
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = match ? JSON.parse(match[0]) : { recommendations: [] };
        res.json(parsed);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Quiz ──
app.post('/api/quiz', async (req, res) => {
    const { anime, difficulty } = req.body;
    const prompt = `Cree 5 questions de quiz sur ${anime || 'les animes populaires'} (difficulte: ${difficulty || 'moyen'}). JSON: {"questions":[{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]}`;
    try {
        const raw = await callMistral([{ role: 'user', content: prompt }], 1000, 0.5);
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = match ? JSON.parse(match[0]) : { questions: [] };
        res.json(parsed);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Démarrage ──
app.listen(PORT, () => {
    console.log(`[OtAkU+ IA] Serveur demarre sur port ${PORT}`);
    console.log(`[OtAkU+ IA] Cle Mistral: ${MISTRAL_KEY ? 'OK' : 'MANQUANTE'}`);
    console.log(`[OtAkU+ IA] Routes: /api/chat, /chat, /ask, /api/recommend, /api/quiz`);
});
