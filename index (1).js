// OtAkU+ Backend Server — DAVIESLAY
// Version securisee — ne crashe pas si DB indisponible

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        'https://marcelaagbassi-create.github.io',
        'http://localhost',
        'http://127.0.0.1',
        'null'
    ],
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
    credentials: true
}));
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true}));

// ── Health check (toujours disponible) ──
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        app: 'OtAkU+',
        version: '2.0',
        author: 'DAVIESLAY',
        db: dbConnected ? 'connected' : 'disconnected',
        redis: redisConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({status:'ok', timestamp: new Date().toISOString()});
});

// ── Connexion PostgreSQL (gracieuse) ──
let db = null;
let dbConnected = false;

async function connectDB() {
    if (!process.env.DATABASE_URL) {
        console.warn('[OtAkU+] DATABASE_URL non definie — mode sans DB');
        return;
    }
    try {
        const { Pool } = require('pg');
        db = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        await db.query('SELECT 1');
        dbConnected = true;
        console.log('[OtAkU+] PostgreSQL connecte');
        await initDB();
    } catch (e) {
        console.warn('[OtAkU+] PostgreSQL erreur:', e.message);
    }
}

// ── Connexion Redis (gracieuse) ──
let redisClient = null;
let redisConnected = false;

async function connectRedis() {
    if (!process.env.REDIS_URL) {
        console.warn('[OtAkU+] REDIS_URL non definie — mode sans cache');
        return;
    }
    try {
        const { createClient } = require('redis');
        redisClient = createClient({ url: process.env.REDIS_URL });
        redisClient.on('error', (e) => console.warn('[OtAkU+] Redis erreur:', e.message));
        await redisClient.connect();
        redisConnected = true;
        console.log('[OtAkU+] Redis connecte');
    } catch (e) {
        console.warn('[OtAkU+] Redis non disponible:', e.message);
    }
}

// ── Créer les tables si elles n'existent pas ──
async function initDB() {
    if (!db) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                provider VARCHAR(20) DEFAULT 'local',
                avatar_url TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(50) NOT NULL,
                avatar VARCHAR(10) DEFAULT '?',
                avatar_img TEXT,
                color VARCHAR(20) DEFAULT '#f97316',
                xp INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS favorites (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                item_id VARCHAR(100) NOT NULL,
                title VARCHAR(200),
                cover TEXT,
                type VARCHAR(20) DEFAULT 'manga',
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, item_id)
            );
            CREATE TABLE IF NOT EXISTS watch_history (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                item_id VARCHAR(100),
                title VARCHAR(200),
                episode INTEGER DEFAULT 1,
                season INTEGER DEFAULT 1,
                watched_at TIMESTAMP DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS qr_sessions (
                id SERIAL PRIMARY KEY,
                token VARCHAR(32) UNIQUE NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                scanned BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '10 minutes'
            );
        `);
        console.log('[OtAkU+] Tables DB initialisees');
    } catch (e) {
        console.warn('[OtAkU+] Erreur init tables:', e.message);
    }
}

// ── Helpers JWT ──
const JWT_SECRET = process.env.JWT_SECRET || 'otakuplus_default_secret';
function signToken(payload) {
    try {
        const jwt = require('jsonwebtoken');
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
    } catch(e) { return null; }
}
function verifyToken(token) {
    try {
        const jwt = require('jsonwebtoken');
        return jwt.verify(token, JWT_SECRET);
    } catch(e) { return null; }
}
function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.replace('Bearer ', '');
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({error: 'Token invalide'});
    req.userId = payload.id;
    next();
}

// ── ROUTES AUTH ──
const bcrypt = require('bcryptjs');

// Inscription
app.post('/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
        return res.status(400).json({error: 'Champs manquants'});
    if (password.length < 6)
        return res.status(400).json({error: 'Mot de passe trop court'});
    try {
        const hash = await bcrypt.hash(password, 10);
        if (db) {
            const existing = await db.query('SELECT id FROM users WHERE email=$1', [email]);
            if (existing.rows.length > 0)
                return res.status(409).json({error: 'Email deja utilise'});
            const result = await db.query(
                'INSERT INTO users(username,email,password_hash,provider) VALUES($1,$2,$3,$4) RETURNING id,username,email',
                [username, email, hash, 'local']
            );
            const user = result.rows[0];
            // Créer profil par défaut
            await db.query(
                'INSERT INTO profiles(user_id,name,color) VALUES($1,$2,$3)',
                [user.id, username, '#f97316']
            );
            const token = signToken({id: user.id, email: user.email});
            return res.json({user, token, message: 'Compte cree !'});
        } else {
            // Mode sans DB — retourner un token local
            const fakeUser = {id: Date.now(), username, email};
            return res.json({user: fakeUser, token: signToken(fakeUser), message: 'Compte cree (local) !'});
        }
    } catch(e) {
        console.error('Register error:', e.message);
        res.status(500).json({error: 'Erreur serveur'});
    }
});

// Connexion
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({error: 'Champs manquants'});
    try {
        if (db) {
            const result = await db.query(
                'SELECT id,username,email,password_hash,avatar_url FROM users WHERE email=$1',
                [email]
            );
            if (result.rows.length === 0)
                return res.status(401).json({error: 'Email ou mot de passe incorrect'});
            const user = result.rows[0];
            const valid = await bcrypt.compare(password, user.password_hash || '');
            if (!valid)
                return res.status(401).json({error: 'Email ou mot de passe incorrect'});
            // Charger les profils
            const profiles = await db.query('SELECT * FROM profiles WHERE user_id=$1', [user.id]);
            user.profiles = profiles.rows;
            const token = signToken({id: user.id, email: user.email});
            return res.json({user, token});
        } else {
            return res.status(503).json({error: 'Base de donnees indisponible'});
        }
    } catch(e) {
        console.error('Login error:', e.message);
        res.status(500).json({error: 'Erreur serveur'});
    }
});

// ── ROUTES FAVORIS ──
app.get('/favorites', authMiddleware, async (req, res) => {
    try {
        if (!db) return res.json([]);
        const result = await db.query(
            'SELECT * FROM favorites WHERE user_id=$1 ORDER BY created_at DESC',
            [req.userId]
        );
        res.json(result.rows);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/favorites', authMiddleware, async (req, res) => {
    const { item_id, title, cover, type } = req.body;
    try {
        if (!db) return res.json({ok: true, local: true});
        await db.query(
            'INSERT INTO favorites(user_id,item_id,title,cover,type) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,item_id) DO NOTHING',
            [req.userId, item_id, title, cover, type||'manga']
        );
        res.json({ok: true});
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.delete('/favorites/:item_id', authMiddleware, async (req, res) => {
    try {
        if (!db) return res.json({ok: true});
        await db.query(
            'DELETE FROM favorites WHERE user_id=$1 AND item_id=$2',
            [req.userId, req.params.item_id]
        );
        res.json({ok: true});
    } catch(e) { res.status(500).json({error: e.message}); }
});

// ── ROUTES PROFILS ──
app.get('/profiles', authMiddleware, async (req, res) => {
    try {
        if (!db) return res.json([]);
        const result = await db.query('SELECT * FROM profiles WHERE user_id=$1', [req.userId]);
        res.json(result.rows);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/profiles/select', authMiddleware, async (req, res) => {
    res.json({ok: true, profileId: req.body.profileId});
});

// ── ROUTES QR CODE ──
app.post('/auth/qr/create', async (req, res) => {
    const { token, url } = req.body;
    try {
        if (db) {
            await db.query(
                'INSERT INTO qr_sessions(token) VALUES($1) ON CONFLICT(token) DO NOTHING',
                [token]
            );
        }
        res.json({ok: true, token, url});
    } catch(e) { res.json({ok: true}); }
});

app.get('/auth/qr/status', async (req, res) => {
    const { token } = req.query;
    try {
        if (db) {
            const r = await db.query(
                'SELECT qs.scanned, u.id, u.username, u.email FROM qr_sessions qs LEFT JOIN users u ON u.id=qs.user_id WHERE qs.token=$1 AND qs.expires_at > NOW()',
                [token]
            );
            if (r.rows.length > 0 && r.rows[0].scanned) {
                const user = r.rows[0];
                const jwt = signToken({id: user.id, email: user.email});
                return res.json({scanned: true, user, jwt});
            }
        }
        res.json({scanned: false});
    } catch(e) { res.json({scanned: false}); }
});

app.get('/auth/qr/verify', async (req, res) => {
    const { token } = req.query;
    try {
        if (db) {
            const r = await db.query(
                'SELECT user_id FROM qr_sessions WHERE token=$1 AND expires_at > NOW()',
                [token]
            );
            if (r.rows.length > 0 && r.rows[0].user_id) {
                const uid = r.rows[0].user_id;
                await db.query('UPDATE qr_sessions SET scanned=TRUE WHERE token=$1', [token]);
                const u = await db.query('SELECT id,username,email FROM users WHERE id=$1', [uid]);
                if (u.rows.length > 0) {
                    const jwt = signToken({id: u.rows[0].id, email: u.rows[0].email});
                    return res.json({user: u.rows[0], token: jwt});
                }
            }
        }
        res.status(404).json({error: 'Token invalide ou expire'});
    } catch(e) { res.status(500).json({error: e.message}); }
});

// ── Démarrage ──
async function start() {
    // Connexions DB (non bloquantes)
    await connectDB();
    await connectRedis();

    // Keep-alive interne
    if (process.env.RENDER_EXTERNAL_URL) {
        setInterval(() => {
            const https = require('https');
            https.get(process.env.RENDER_EXTERNAL_URL + '/health', () => {}).on('error', () => {});
        }, 14 * 60 * 1000);
    }

    app.listen(PORT, () => {
        console.log('[OtAkU+] Serveur demarre sur port', PORT);
        console.log('[OtAkU+] DB:', dbConnected ? 'OK' : 'OFFLINE');
        console.log('[OtAkU+] Redis:', redisConnected ? 'OK' : 'OFFLINE');
    });
}

start().catch(e => {
    console.error('[OtAkU+] Erreur demarrage:', e.message);
    process.exit(1);
});
