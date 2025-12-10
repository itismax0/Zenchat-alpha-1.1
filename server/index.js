
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
        if (baseUsername.length < 3) baseUsername = 'user' + Math.floor(Math.random() * 10000);
        
        let username = baseUsername;
        let counter = 1;
        let isUnique = false;
        
        // Try up to 5 times to find a unique username
        for(let i=0; i<5; i++) {
            const check = await User.findOne({ username });
            if (!check) {
                isUnique = true;
                break;
            }
            username = `${baseUsername}${counter++}${Math.floor(Math.random() * 100)}`;
        }
        
        if (!isUnique) username = `${baseUsername}_${newUserId}`; // Fallback

        const newUser = new User({
            id: newUserId,
            name,
            email: safeEmail,
            password: hashedPassword,
            username: username, // Explicitly save generated username
            avatarUrl: '',
        });
        await newUser.save();
        const token = jwt.sign({ id: newUserId, email: safeEmail }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, _id, __v, ...userProfile } = newUser.toObject();
        res.json({ ...userProfile, token });
    } catch (e) {
        console.error("Register Error", e);
        // Handle race condition on unique index just in case
        if (e.code === 11000) {
             return res.status(400).json({ error: 'Username or Email collision. Please try again.' });
        }
        res.status(500).json({ error: 'Error registering user' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // VULNERABILITY FIX 1: NoSQL Injection Prevention
        const safeEmail = String(email);

        const user = await User.findOne({ email: safeEmail });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
             // Legacy fallback for plain text passwords (should be removed in prod)
             if (user.password === password) {
                 const salt = await bcrypt.genSalt(10);
                 user.password = await bcrypt.hash(password, salt);
                 await user.save();
             } else {
                 return res.status(401).json({ error: 'Invalid email or password' });
             }
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, _id, __v, ...userProfile } = user.toObject();
        res.json({ ...userProfile, token });
    } catch (e) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// API Routes (Profile, Groups, Sync)
app.post('/api/users/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        if (req.user.id !== id) return res.status(403).json({ error: 'Forbidden' });
        
        // SECURITY FIX: Whitelist Allowed Fields
        const allowedFields = [
            'name', 'username', 'bio', 'phoneNumber', 'address', 'birthDate', 
            'avatarUrl', 'statusEmoji', 'profileColor', 'profileBackgroundEmoji'
        ];

        const updates = {};
        const unsetUpdates = {}; // For $unset (removing fields)

        Object.keys(req.body).forEach(key => {
            if (allowedFields.includes(key)) {
                // Special check for username empty string -> remove
                if (key === 'username') {
                     const val = req.body[key];
                     if (val === '' || val === null) {
                         unsetUpdates.username = 1;
                     } else {
                         const usernameRegex = /^[a-zA-Z0-9_]{3,25}$/;
                         if (!usernameRegex.test(val)) return; // Skip invalid
                         updates.username = val;
                     }
                } else {
                    updates[key] = req.body[key];
                }
            }
        });
        
        // Construct update operation
        const updateOp = {};
        if (Object.keys(updates).length > 0) updateOp.$set = updates;
        if (Object.keys(unsetUpdates).length > 0) updateOp.$unset = unsetUpdates;
        
        // If nothing to update, return current user
        if (Object.keys(updateOp).length === 0) {
            const user = await User.findOne({ id }).select('-_id -__v -password');
            return res.json(user);
        }

        const user = await User.findOneAndUpdate(
            { id: id }, 
            updateOp, 
            { new: true, runValidators: true }
        );
        
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Notify friends about profile update
        const friends = await User.find({ "contacts.id": id }).select('id');
        friends.forEach(friend => {
             req.io.to(friend.id).emit('contact_update', { id: user.id, ...updates, ...unsetUpdates }); 
        });
        
        const { password: _, _id, __v, ...userProfile } = user.toObject();
        res.json(userProfile);
    } catch (e) { 
        // Handle Duplicate Key Error (Username taken)
        if (e.code === 11000) {
            return res.status(400).json({ error: 'Это имя пользователя уже занято' });
        }
        console.error("Update profile error:", e);
        res.status(500).json({ error: 'Update failed' }); 
    }
});

// --- NEW APIs: Block, Clear, AutoDelete ---

// Block/Unblock
app.post('/api/users/:id/block', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { targetId, isBlocked } = req.body;
        
        if (req.user.id !== id) return res.status(403).json({ error: 'Forbidden' });

        const updateOp = isBlocked 
            ? { $addToSet: { blockedUsers: targetId } }
            : { $pull: { blockedUsers: targetId } };

        const user = await User.findOneAndUpdate({ id }, updateOp, { new: true });
        res.json({ blockedUsers: user.blockedUsers });
    } catch (e) { console.error("Block failed", e); res.status(500).json({ error: 'Block failed' }); }
});

// Clear History
app.post('/api/users/:id/clear', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { targetId, forEveryone } = req.body;
        if (req.user.id !== id) return res.status(403).json({ error: 'Forbidden' });

        // Clear history in user document
        await User.updateOne({ id }, { $set: { [`chatHistory.${targetId}`]: [] } });
        
        // Also update last message in contacts to empty
        await User.updateOne(
            { id: id, "contacts.id": targetId },
            { $set: { "contacts.$.lastMessage": "", "contacts.$.lastMessageTime": Date.now() } }
        );

        if (forEveryone) {
            // Clear for the other user too
            await User.updateOne({ id: targetId }, { $set: { [`chatHistory.${id}`]: [] } });
            await User.updateOne(
                { id: targetId, "contacts.id": id },
                { $set: { "contacts.$.lastMessage": "", "contacts.$.lastMessageTime": Date.now() } }
            );
            // Notify other user
            req.io.to(targetId).emit('history_cleared', { chatId: id });
        }

        res.json({ success: true });
    } catch (e) { console.error("Clear history failed", e); res.status(500).json({ error: 'Clear history failed' }); }
});

// Set Auto Delete
app.post('/api/users/:id/autodelete', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { targetId, seconds } = req.body;
        if (req.user.id !== id) return res.status(403).json({ error: 'Forbidden' });

        await User.updateOne(
            { id: id, "contacts.id": targetId },
            { $set: { "contacts.$.autoDelete": seconds } }
        );
        
        // Also update for the other user to keep sync (Telegram style)
        await User.updateOne(
            { id: targetId, "contacts.id": id },
            { $set: { "contacts.$.autoDelete": seconds } }
        );
        
        // Notify other user via socket
        req.io.to(targetId).emit('contact_update', { id: id, autoDelete: seconds });

        res.json({ success: true });
    } catch (e) { console.error("Auto-delete set failed", e); res.status(500).json({ error: 'Auto-delete set failed' }); }
});


app.post('/api/groups', authenticateToken, async (req, res) => {
    try {
        const { name, type, members, avatarUrl, ownerId } = req.body;
        const newGroup = new Group({
            id: Date.now().toString(36),
            name, type, avatarUrl, members: [...members, ownerId], admins: [ownerId], ownerId,
            chatHistory: [{ id: Date.now().toString(), text: 'Created', senderId: ownerId, timestamp: Date.now(), status: 'read', type: 'text' }]
        });
        await newGroup.save();
        [...members, ownerId].forEach(mid => {
            req.io.to(mid).emit('new_chat', { id: newGroup.id, name, type, avatarUrl });
        });
        res.json(newGroup);
    } catch (e) { console.error("Group creation failed", e); res.status(500).json({ error: 'Group creation failed' }); }
});

app.get('/api/sync/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });

        const user = await User.findOne({ id: userId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        let hydratedContacts = [];

        for (let contact of user.contacts) {
            if (contact.type === 'user' && contact.id !== 'saved-messages' && contact.id !== 'gemini-ai') {
                // Ensure we send back the username and bio
                const contactProfile = await User.findOne({ id: contact.id }).select('name avatarUrl bio username phoneNumber address birthDate statusEmoji profileColor profileBackgroundEmoji');
                if (contactProfile) {
                    const isOnline = userSocketMap.has(contact.id);
                    hydratedContacts.push({
                        ...contact,
                        name: contactProfile.name,
                        avatarUrl: contactProfile.avatarUrl,
                        bio: contactProfile.bio,
                        username: contactProfile.username, // CRITICAL FOR SEARCH
                        phoneNumber: contactProfile.phoneNumber,
                        address: contactProfile.address,
                        birthDate: contactProfile.birthDate,
                        statusEmoji: contactProfile.statusEmoji,
                        profileColor: contactProfile.profileColor,
                        profileBackgroundEmoji: contactProfile.profileBackgroundEmoji,
                        isOnline: isOnline
                    });
                    continue;
                }
            }
            hydratedContacts.push(contact);
        }

        const groups = await Group.find({ members: userId });
        const groupContacts = groups.map(g => ({
            id: g.id, name: g.name, avatarUrl: g.avatarUrl, type: g.type,
            lastMessage: g.chatHistory.slice(-1)[0]?.text || '',
            unreadCount: 0,
            membersCount: g.members.length
        }));
        
        const fullHistory = { ...user.chatHistory };
        groups.forEach(g => { fullHistory[g.id] = g.chatHistory; });

        res.json({
            profile: { id: user.id, name: user.name, email: user.email, username: user.username, avatarUrl: user.avatarUrl, blockedUsers: user.blockedUsers },
            contacts: [...hydratedContacts, ...groupContacts],
            chatHistory: fullHistory,
            settings: user.settings,
            devices: user.devices
        });
    } catch (e) {
        console.error("Sync error", e);
        res.status(500).json({ error: 'Sync failed' }); 
    }
});

app.get('/api/users/search', authenticateToken, async (req, res) => {
    const { query, currentUserId } = req.query;
    
    // Safety check
    if (!query || String(query).trim().length === 0) return res.json([]);

    try {
        const cleanQuery = String(query).replace(/@/g, '').trim();
        // VULNERABILITY FIX 4: ReDoS Prevention (Escape regex special chars)
        const safeQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        const regex = new RegExp(safeQuery, 'i');

        const users = await User.find({ 
            id: { $ne: currentUserId }, 
            $or: [
                { name: regex },
                { username: regex },
                { email: regex }
            ]
        })
        .select('id name username avatarUrl bio') // Ensure username is selected
        .limit(20);
        
        res.json(users);
    } catch (e) {
        console.error("Search error", e);
        res.status(500).json({ error: "Search failed" });
    }
});

// --- Background Job: Auto Delete ---
const runAutoDeleteJob = async () => {
    try {
        const cursor = User.find({ "contacts.autoDelete": { $gt: 0 } }).cursor();
        
        for (let user = await cursor.next(); user != null; user = await cursor.next()) {
            let updatedHistory = {};
            let needsUpdate = false;

            for (const contact of user.contacts) {
                if (contact.autoDelete > 0) {
                    const threshold = Date.now() - (contact.autoDelete * 1000);
                    const chatId = contact.id;
                    const history = user.chatHistory[chatId] || [];
                    
                    const originalLen = history.length;
                    const newHistory = history.filter(msg => msg.timestamp > threshold);
                    
                    if (newHistory.length < originalLen) {
                        updatedHistory[`chatHistory.${chatId}`] = newHistory;
                        needsUpdate = true;
                    }
                }
            }
            
            if (needsUpdate) {
                await User.updateOne({ _id: user._id }, { $set: updatedHistory });
                if (userSocketMap.has(user.id)) {
                    const freshUser = await User.findById(user._id);
                    io.to(user.id).emit('history_update', { chatHistory: freshUser.chatHistory });
                }
            }
        }
    } catch (e) {
        console.error("Auto Delete Job Failed", e);
    }
};

setInterval(runAutoDeleteJob, 60000);


// --- DB Helpers ---
const saveMessageToDB = async (senderId, receiverId, message) => {
    try {
        if (receiverId === 'saved-messages') {
            await User.updateOne({ id: senderId }, { $push: { "chatHistory.saved-messages": message } });
            return true;
        }
        
        if (senderId === receiverId) {
             await User.updateOne({ id: senderId }, { $push: { [`chatHistory.${senderId}`]: { ...message, status: 'read' } } });
             return true;
        }

        const group = await Group.findOne({ id: receiverId });
        if (group) {
            await Group.updateOne({ id: receiverId }, { $push: { chatHistory: message } });
            await User.updateMany(
                { id: { $in: group.members } }, 
                { 
                    $set: { "contacts.$[elem].lastMessage": message.text || (message.isEncrypted ? '🔒 Зашифровано' : 'Вложение'), "contacts.$[elem].lastMessageTime": message.timestamp },
                    $inc: { "contacts.$[elem].unreadCount": 1 }
                },
                { arrayFilters: [{ "elem.id": receiverId }] }
            );
            return true;
        }
        
        const receiver = await User.findOne({ id: receiverId });
        if (receiver && receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
            console.log(`Message blocked from ${senderId} to ${receiverId}`);
            return true; // Technically saved/handled
        }

        // SAVE TO HISTORIES
        try {
            await User.updateOne({ id: senderId }, { $push: { [`chatHistory.${receiverId}`]: { ...message, status: 'sent' } } });
            await User.updateOne({ id: receiverId }, { $push: { [`chatHistory.${senderId}`]: message } });
        } catch (dbErr) {
             console.error("FAILED TO SAVE MESSAGE TO DB (Likely too large)", dbErr);
             return false;
        }
        
        const preview = message.isEncrypted ? '🔒 Зашифрованное сообщение' : (message.text || 'Вложение');
        
        // Update SENDER'S Contact List
        const sender = await User.findOne({ id: senderId });
        if (sender) {
             const contactExists = sender.contacts.some(c => c.id === receiverId);
             if (contactExists) {
                  await User.updateOne(
                      { id: senderId, "contacts.id": receiverId },
                      { $set: { "contacts.$.lastMessage": preview, "contacts.$.lastMessageTime": message.timestamp } }
                  );
             } else {
                 // Receiver not in Sender's contacts yet (e.g. first message). Add them!
                 let receiverInfo = await User.findOne({ id: receiverId });
                 if (receiverInfo) {
                     const newContact = {
                         id: receiverId,
                         name: receiverInfo.name,
                         avatarUrl: receiverInfo.avatarUrl,
                         type: 'user',
                         lastMessage: preview,
                         lastMessageTime: message.timestamp,
                         unreadCount: 0,
                         isOnline: false, // will update via socket status
                         username: receiverInfo.username
                     };
                     await User.updateOne({ id: senderId }, { $push: { contacts: newContact } });
                 }
             }
        }

        // Update RECEIVER'S Contact List
        if (receiver) {
            const contactExists = receiver.contacts.some(c => c.id === senderId);
            if (contactExists) {
                await User.updateOne(
                    { id: receiverId, "contacts.id": senderId }, 
                    { $set: { "contacts.$.lastMessage": preview, "contacts.$.lastMessageTime": message.timestamp }, $inc: { "contacts.$.unreadCount": 1 }}
                );
            } else {
                const senderInfo = await User.findOne({ id: senderId });
                const newContact = {
                    id: senderId,
                    name: senderInfo.name,
                    avatarUrl: senderInfo.avatarUrl,
                    type: 'user',
                    lastMessage: preview,
                    lastMessageTime: message.timestamp,
                    unreadCount: 1,
                    isOnline: true,
                    username: senderInfo.username 
                };
                await User.updateOne({ id: receiverId }, { $push: { contacts: newContact } });
            }
        }
        return true;
    } catch (e) { 
        console.error("DB Save Error", e); 
        return false;
    }
};

const updateUserStatus = async (userId, isOnline) => {
    const lastSeen = Date.now();
    await User.updateMany(
        { "contacts.id": userId },
        { 
            $set: { 
                "contacts.$[elem].isOnline": isOnline,
                "contacts.$[elem].lastSeen": lastSeen
            } 
        },
        { arrayFilters: [{ "elem.id": userId }] }
    );

    const friends = await User.find({ "contacts.id": userId }).select('id');
    friends.forEach(friend => {
        req.io.to(friend.id).emit('user_status', { 
            userId, 
            isOnline, 
            lastSeen 
        });
    });
};

// --- Socket.io ---
io.on('connection', (socket) => {
    const userId = socket.userId;
    
    if (userId) {
        socket.join(userId);
        if (!userSocketMap.has(userId)) {
            userSocketMap.set(userId, new Set());
            updateUserStatus(userId, true);
        }
        userSocketMap.get(userId).add(socket.id);
    }

    socket.on('join', (id) => {
        socket.join(id);
        Group.find({ members: id }).then(groups => {
            groups.forEach(g => socket.join(g.id));
        });
    });

    socket.on('send_message', async ({ message, receiverId }) => {
        // VULNERABILITY FIX 2: Socket Identity Spoofing Prevention
        const senderId = socket.userId; 
        if (!senderId || message.senderId !== senderId) {
            console.warn(`Spoofing attempt! Socket ${socket.id} tried to send as ${message.senderId}`);
            socket.emit('message_sent', { tempId: message.id, status: 'error' });
            return;
        }

        const receiver = await User.findOne({ id: receiverId });
        if (receiver && receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
             socket.emit('message_sent', { tempId: message.id, status: 'sent' });
             return;
        }

        const success = await saveMessageToDB(senderId, receiverId, message);

        if (success) {
            socket.emit('message_sent', { tempId: message.id, status: 'sent' });
            
            const group = await Group.findOne({ id: receiverId }).select('id');
            if (group) {
                 io.to(receiverId).emit('receive_message', { message, chatId: receiverId });
            } else {
                 io.to(receiverId).emit('receive_message', { message });
            }
        } else {
             socket.emit('message_sent', { tempId: message.id, status: 'error' });
        }
    });

    socket.on('secret_chat_request', ({ targetId, senderPublicKey, tempChatId }) => {
        io.to(targetId).emit('secret_chat_request', { 
            from: userId, 
            senderPublicKey,
            tempChatId
        });
    });

    socket.on('secret_chat_accepted', ({ targetId, acceptorPublicKey, tempChatId }) => {
        io.to(targetId).emit('secret_chat_accepted', {
            from: userId,
            acceptorPublicKey,
            tempChatId
        });
    });

    socket.on('edit_message', async ({ message, chatId }) => {
        const senderId = socket.userId; // Secure sender
        if (message.senderId !== senderId) return;

        const targetId = chatId; 
        
        if (chatId) {
            await Group.updateOne(
                { id: chatId, "chatHistory.id": message.id },
                { $set: { "chatHistory.$.text": message.text, "chatHistory.$.isEdited": true } }
            );
            io.to(chatId).emit('message_edited', { message, chatId });
        } else {
            await User.updateOne(
                { id: senderId, [`chatHistory.${targetId}.id`]: message.id },
                { $set: { [`chatHistory.${targetId}.$.text`]: message.text, [`chatHistory.${targetId}.$.isEdited`]: true } }
            );
            await User.updateOne(
                { id: targetId, [`chatHistory.${senderId}.id`]: message.id },
                { $set: { [`chatHistory.${senderId}.$.text`]: message.text, [`chatHistory.${senderId}.$.isEdited`]: true } }
            );
            
            io.to(targetId).emit('message_edited', { message });
            io.to(senderId).emit('message_edited', { message }); 
        }
    });
    
    socket.on('delete_message', async ({ messageId, chatId, forEveryone }) => {
        const senderId = socket.userId; 
        const targetId = chatId; 

        if (forEveryone) {
            const group = await Group.findOne({ id: chatId });
            if (group) {
                await Group.updateOne({ id: chatId }, { $pull: { chatHistory: { id: messageId } } });
                io.to(chatId).emit('message_deleted', { messageId, chatId });
                return;
            }
            
            await User.updateOne({ id: senderId }, { $pull: { [`chatHistory.${targetId}`]: { id: messageId } } });
            await User.updateOne({ id: targetId }, { $pull: { [`chatHistory.${senderId}`]: { id: messageId } } });
            
            io.to(targetId).emit('message_deleted', { messageId, chatId: senderId });
            io.to(senderId).emit('message_deleted', { messageId, chatId: targetId });
        } else {
             await User.updateOne({ id: senderId }, { $pull: { [`chatHistory.${targetId}`]: { id: messageId } } });
        }
    });

    socket.on('mark_read', async ({ chatId, readerId }) => {
        await User.updateMany(
            { id: chatId, [`chatHistory.${readerId}.status`]: 'sent' },
            { $set: { [`chatHistory.${readerId}.$[elem].status`]: 'read' } },
            { arrayFilters: [{ "elem.status": 'sent' }] }
        );
        io.to(chatId).emit('messages_read', { chatId: readerId }); 
    });

    socket.on('disconnect', () => {
        if (userId && userSocketMap.has(userId)) {
            const sockets = userSocketMap.get(userId);
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                userSocketMap.delete(userId);
                updateUserStatus(userId, false); 
            }
        }
    });
    
    socket.on('typing', (data) => socket.to(data.to).emit('typing', data));
    socket.on("callUser", (data) => io.to(data.userToCall).emit("callUser", data));
    socket.on("answerCall", (data) => io.to(data.to).emit("callAccepted", data.signal));
    socket.on("iceCandidate", (data) => io.to(data.target).emit("iceCandidate", data));
    socket.on("endCall", (data) => io.to(data.to).emit("callEnded"));
});

if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    const distPath = path.join(__dirname, '../dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return;
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
