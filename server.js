const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Clé API Mistral depuis les variables d'environnement Render
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_API = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-large-latest';

// CORS — autoriser GitHub Pages + localhost
const allowedOrigins = [
    'https://marcelaagbassi-create.github.io',
    'http://localhost',
    'http://127.0.0.1',
    'null', // fichiers locaux
];

app.use(cors({
    origin: '*', // Permissif - GitHub Pages + local
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors()); // Pre-flight

app.use(express.json({ limit: '10kb' }));

// ── Route santé ──
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'OtAkU+ AI Server',
        model: MISTRAL_MODEL,
        key_configured: !!MISTRAL_KEY,
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Route principale : proxy Mistral ──
app.post('/api/chat', async (req, res) => {
    if (!MISTRAL_KEY) {
        return res.status(500).json({ error: 'Cle API Mistral non configuree sur le serveur.' });
    }

    const { messages, max_tokens, temperature, context } = req.body;

    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'messages requis (array)' });
    }

    // Système OtAkU+
    const systemPrompt = `Tu es un assistant expert en anime et manga pour l'application OtAkU+. ` +
        `Tu connais parfaitement tous les animes, mangas, personnages, studios, saisons. ` +
        `Tu recommandes des contenus, donnes des infos sur les series, fais des comparaisons. ` +
        `Tu reponds toujours en francais, de facon concise et enthousiaste. ` +
        `Quand tu recommandes un anime, donne le titre exact en japonais et en anglais. ` +
        (context ? `Contexte utilisateur: ${context}` : '');

    const fullMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10), // max 10 messages d'historique
    ];

    try {
        const response = await fetch(MISTRAL_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_KEY}`,
            },
            body: JSON.stringify({
                model: MISTRAL_MODEL,
                messages: fullMessages,
                max_tokens: Math.min(max_tokens || 600, 1000),
                temperature: temperature || 0.7,
                safe_prompt: false,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            console.error('Mistral error:', response.status, err);
            return res.status(response.status).json({
                error: err.message || `Erreur Mistral ${response.status}`,
            });
        }

        const data = await response.json();
        const answer = data.choices?.[0]?.message?.content || 'Pas de reponse.';

        res.json({
            answer,
            model: data.model,
            usage: data.usage,
        });

    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Erreur serveur: ' + err.message });
    }
});

// ── Route recommandations ──
app.post('/api/recommend', async (req, res) => {
    if (!MISTRAL_KEY) {
        return res.status(500).json({ error: 'Cle API non configuree.' });
    }

    const { history, favorites, genre } = req.body;

    const prompt = `En te basant sur ces informations utilisateur:` +
        (history?.length ? ` Animes regardes: ${history.join(', ')}.` : '') +
        (favorites?.length ? ` Favoris: ${favorites.join(', ')}.` : '') +
        (genre ? ` Genre prefere: ${genre}.` : '') +
        ` Recommande 5 animes avec titre, genre, et une phrase de description. ` +
        `Format: JSON avec tableau "recommendations" contenant {title, genre, description, score}.`;

    try {
        const response = await fetch(MISTRAL_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_KEY}`,
            },
            body: JSON.stringify({
                model: MISTRAL_MODEL,
                messages: [
                    { role: 'system', content: 'Tu es un expert anime. Reponds uniquement en JSON valide.' },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 800,
                temperature: 0.6,
            }),
        });

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || '{}';

        // Parser le JSON de la réponse
        let parsed;
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { recommendations: [] };
        } catch {
            parsed = { recommendations: [], raw };
        }

        res.json(parsed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Route quiz ──
app.post('/api/quiz', async (req, res) => {
    if (!MISTRAL_KEY) {
        return res.status(500).json({ error: 'Cle API non configuree.' });
    }

    const { anime, difficulty } = req.body;

    const prompt = `Cree 5 questions de quiz sur ${anime || 'les animes populaires'} ` +
        `(difficulte: ${difficulty || 'moyen'}). ` +
        `Format JSON: {"questions": [{"question": "...", "options": ["A","B","C","D"], "correct": 0, "explanation": "..."}]}`;

    try {
        const response = await fetch(MISTRAL_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MISTRAL_KEY}`,
            },
            body: JSON.stringify({
                model: MISTRAL_MODEL,
                messages: [
                    { role: 'system', content: 'Expert anime. Reponds uniquement en JSON valide.' },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 1000,
                temperature: 0.5,
            }),
        });

        const data = await response.json();
        const raw = data.choices?.[0]?.message?.content || '{}';

        let parsed;
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { questions: [] };
        } catch {
            parsed = { questions: [], raw };
        }

        res.json(parsed);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Routes aliases pour compatibilite
app.post('/chat', async (req, res) => {
    req.url = '/api/chat';
    app._router.handle(req, res, () => {});
});
app.post('/ask', async (req, res) => {
    req.url = '/api/chat';
    app._router.handle(req, res, () => {});
});

app.listen(PORT, () => {
    console.log(`OtAkU+ AI Server running on port ${PORT}`);
    console.log(`Mistral key: ${MISTRAL_KEY ? 'configuree ✅' : 'MANQUANTE ❌'}`);
});
