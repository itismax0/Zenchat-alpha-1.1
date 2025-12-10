import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Environment
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/zenchat_local';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_prod';

// --- Security: Trust Proxy ---
app.set('trust proxy', 1);

// --- HTTPS Redirect Middleware ---
app.use((req, res, next) => {
    if ((process.env.NODE_ENV === 'production' || process.env.RENDER) && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' })); // Increased limit for Base64 images
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// --- Rate Limiting ---
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: 500, // Increased
	standardHeaders: true,
	legacyHeaders: false,
    message: { error: 'Слишком много запросов с вашего IP, попробуйте позже.' }
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, 
	max: 50, 
	standardHeaders: true,
	legacyHeaders: false,
    message: { error: 'Слишком много попыток входа. Попробуйте через час.' }
});
app.use('/api/register', authLimiter);
app.use('/api/login', authLimiter);


// --- Security: Auth Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// --- PRESENCE MANAGEMENT ---
const userSocketMap = new Map();

// --- Socket.io Setup ---
const io = new Server(server, {
    maxHttpBufferSize: 1e8, // 100 MB
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (!err) {
                socket.userId = decoded.id;
            }
        });
    }
    next();
});

app.use((req, res, next) => {
    req.io = io;
    next();
});

// --- MongoDB ---
if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
    console.error('❌ FATAL ERROR: MONGO_URI is missing.');
    process.exit(1);
}

const connectDB = async () => {
    try {
        console.log(`🔌 Connecting to MongoDB...`);
        // Mask password in log
        const maskedUri = MONGO_URI.replace(/mongodb(?:\+srv)?:\/\/([^:]+):([^@]+)@/, (match, p1, p2) => `mongodb+srv://${p1}:****@`);
        console.log(`🔌 Attempting to connect to: ${maskedUri}`);
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            autoIndex: process.env.NODE_ENV !== 'production',
            family: 4
        });
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        if (process.env.NODE_ENV === 'production') process.exit(1);
    }
};
connectDB();

// --- Schemas ---
const UserSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, 
    name: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    username: { type: String, unique: true, sparse: true }, 
    avatarUrl: String,
    bio: String,
    phoneNumber: String,
    address: String,
    birthDate: String,
    statusEmoji: String,
    profileColor: String,
    profileBackgroundEmoji: String,
    blockedUsers: [{ type: String }], // Array of blocked IDs
    contacts: { type: Array, default: [] },
    chatHistory: { type: Object, default: {} },
    settings: { type: Object, default: {} },
    devices: { type: Array, default: [] }
});
const User = mongoose.model('User', UserSchema);

const GroupSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: String,
    avatarUrl: String,
    type: { type: String, enum: ['group', 'channel'], default: 'group' },
    members: [{ type: String }],
    admins: [{ type: String }],
    ownerId: String,
    settings: {
        historyVisible: { type: Boolean, default: true },
        sendMessages: { type: Boolean, default: true },
        autoDeleteMessages: { type: Number, default: 0 }
    },
    chatHistory: { type: Array, default: [] },
    createdAt: { type: Number, default: Date.now }
});
const Group = mongoose.model('Group', GroupSchema);

// Standard API Routes
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // VULNERABILITY FIX 1: NoSQL Injection Prevention (Force string)
        const safeEmail = String(email);
        
        const existingUser = await User.findOne({ email: safeEmail });
        if (existingUser) return res.status(400).json({ error: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUserId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

        // ERROR FIX 3: Robust Username Generation Loop (Race Condition Handling)
        let baseUsername = safeEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
        