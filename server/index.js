
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
app.use(express.json({ limit: '50mb' }));

// --- Rate Limiting ---
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, 
	max: 300, 
	standardHeaders: true,
	legacyHeaders: false,
    message: { error: 'Слишком много запросов с вашего IP, попробуйте позже.' }
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, 
	max: 20, 
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
    maxHttpBufferSize: 1e8,
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
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Email already exists' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUserId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

        const newUser = new User({
            id: newUserId,
            name,
            email,
            password: hashedPassword,
            avatarUrl: '',
        });
        await newUser.save();
        const token = jwt.sign({ id: newUserId, email }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, _id, __v, ...userProfile } = newUser.toObject();
        res.json({ ...userProfile, token });
    } catch (e) {
        res.status(500).json({ error: e.code === 11000 ? 'Username/Email taken' : 'Error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
             // Legacy fallback for plain text passwords
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
        const updates = req.body;
        const user = await User.findOneAndUpdate({ id: id }, { $set: updates }, { new: true });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Notify friends about profile update
        const friends = await User.find({ "contacts.id": id }).select('id');
        friends.forEach(friend => {
             req.io.to(friend.id).emit('contact_update', { id: user.id, ...updates });
        });
        const { password: _, _id, __v, ...userProfile } = user.toObject();
        res.json(userProfile);
    } catch (e) { res.status(500).json({ error: 'Update failed' }); }
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
    } catch (e) { res.status(500).json({ error: 'Block failed' }); }
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
    } catch (e) { res.status(500).json({ error: 'Clear history failed' }); }
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
    } catch (e) { res.status(500).json({ error: 'Auto-delete set failed' }); }
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
    } catch (e) { res.status(500).json({ error: 'Group creation failed' }); }
});

app.get('/api/sync/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne({ id: userId });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Check and repair incorrect contact types
        let contactsUpdated = false;
        let hydratedContacts = [];
        for (let contact of user.contacts) {
            if (contact.type === 'group' && contact.id) {
                const groupExists = await Group.exists({ id: contact.id });
                if (!groupExists) {
                    const userExists = await User.exists({ id: contact.id });
                    if (userExists) {
                        contact.type = 'user';
                        contactsUpdated = true;
                    }
                }
            }

            if (contact.type === 'user' && contact.id !== 'saved-messages' && contact.id !== 'gemini-ai') {
                const contactProfile = await User.findOne({ id: contact.id }).select('name avatarUrl bio username phoneNumber address birthDate statusEmoji profileColor profileBackgroundEmoji');
                if (contactProfile) {
                    const isOnline = userSocketMap.has(contact.id);
                    hydratedContacts.push({
                        ...contact,
                        name: contactProfile.name,
                        avatarUrl: contactProfile.avatarUrl,
                        bio: contactProfile.bio,
                        username: contactProfile.username,
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
            if (contact.type === 'group' || contact.type === 'channel') {
                 const group = await Group.findOne({ id: contact.id });
                 if (!group) {
                     const actuallyUser = await User.findOne({ id: contact.id });
                     if (actuallyUser) {
                         contact.type = 'user';
                         contact.name = actuallyUser.name;
                         contact.avatarUrl = actuallyUser.avatarUrl;
                         hydratedContacts.push(contact);
                         continue;
                     }
                 }
            }
            hydratedContacts.push(contact);
        }

        if (contactsUpdated) {
            await User.updateOne({ id: userId }, { $set: { contacts: user.contacts } });
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
            profile: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, blockedUsers: user.blockedUsers },
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
    if (!query) return res.json([]);

    try {
        // Escape regex special characters to prevent crashes
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safeQuery, 'i');

        const users = await User.find({ 
            id: { $ne: currentUserId }, 
            $or: [
                { name: regex },
                { username: regex },
                { email: regex }
            ]
        }).limit(20);
        
        res.json(users);
    } catch (e) {
        console.error("Search error", e);
        res.status(500).json({ error: "Search failed" });
    }
});

// --- Background Job: Auto Delete ---
const runAutoDeleteJob = async () => {
    try {
        // Use cursor for memory efficiency
        const cursor = User.find({ "contacts.autoDelete": { $gt: 0 } }).cursor();
        
        for (let user = await cursor.next(); user != null; user = await cursor.next()) {
            let historyModified = false;
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
                        historyModified = true;
                        needsUpdate = true;
                    }
                }
            }
            
            if (needsUpdate) {
                await User.updateOne({ _id: user._id }, { $set: updatedHistory });
                // Notify client to update UI if online
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

// Run job every minute
setInterval(runAutoDeleteJob, 60000);


// --- DB Helpers ---
const saveMessageToDB = async (senderId, receiverId, message) => {
    try {
        if (receiverId === 'saved-messages') {
            await User.updateOne({ id: senderId }, { $push: { "chatHistory.saved-messages": message } });
            return;
        }
        
        // Prevent duplicate self-messages
        if (senderId === receiverId) {
             // For self-chat that isn't saved-messages (rare but possible), just save once
             await User.updateOne({ id: senderId }, { $push: { [`chatHistory.${senderId}`]: { ...message, status: 'read' } } });
             return;
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
            return;
        }
        // DM Logic
        
        // CHECK BLOCKING
        const receiver = await User.findOne({ id: receiverId });
        if (receiver && receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
            console.log(`Message blocked from ${senderId} to ${receiverId}`);
            return; 
        }

        // Save for sender
        await User.updateOne({ id: senderId }, { $push: { [`chatHistory.${receiverId}`]: { ...message, status: 'sent' } } });
        
        // Save for receiver
        await User.updateOne({ id: receiverId }, { $push: { [`chatHistory.${senderId}`]: message } });
        
        // Update contacts last message
        const preview = message.isEncrypted ? '🔒 Зашифрованное сообщение' : (message.text || 'Вложение');
        
        // Update sender's contact list
        await User.updateOne(
            { id: senderId, "contacts.id": receiverId }, 
            { $set: { "contacts.$.lastMessage": preview, "contacts.$.lastMessageTime": message.timestamp }}
        );

        // Update receiver's contact list
        if (receiver) {
            const contactExists = receiver.contacts.some(c => c.id === senderId);
            if (contactExists) {
                await User.updateOne(
                    { id: receiverId, "contacts.id": senderId }, 
                    { $set: { "contacts.$.lastMessage": preview, "contacts.$.lastMessageTime": message.timestamp }, $inc: { "contacts.$.unreadCount": 1 }}
                );
            } else {
                // Auto-add contact for receiver
                const senderInfo = await User.findOne({ id: senderId });
                const newContact = {
                    id: senderId,
                    name: senderInfo.name,
                    avatarUrl: senderInfo.avatarUrl,
                    type: 'user',
                    lastMessage: preview,
                    lastMessageTime: message.timestamp,
                    unreadCount: 1,
                    isOnline: true
                };
                await User.updateOne({ id: receiverId }, { $push: { contacts: newContact } });
            }
        }
    } catch (e) { console.error("DB Save Error", e); }
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
        const senderId = message.senderId;

        // Check if sender is blocked by receiver before emitting
        const receiver = await User.findOne({ id: receiverId });
        if (receiver && receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
             // Fake success for sender to avoid detection (Anti-Spam)
             socket.emit('message_sent', { tempId: message.id, status: 'sent' });
             return;
        }

        await saveMessageToDB(senderId, receiverId, message);

        socket.emit('message_sent', { tempId: message.id, status: 'sent' });

        const group = await Group.findOne({ id: receiverId }).select('id');
        if (group) {
             io.to(receiverId).emit('receive_message', { message, chatId: receiverId });
        } else {
             io.to(receiverId).emit('receive_message', { message });
        }
    });

    // --- E2EE RELAY EVENTS (Server doesn't process, just forwards) ---
    
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
        const senderId = message.senderId;
        const targetId = chatId; 
        
        // Update in DB
        if (chatId) {
            // Group logic
            await Group.updateOne(
                { id: chatId, "chatHistory.id": message.id },
                { $set: { "chatHistory.$.text": message.text, "chatHistory.$.isEdited": true } }
            );
            io.to(chatId).emit('message_edited', { message, chatId });
        } else {
            // DM logic
            // Update sender's copy
            await User.updateOne(
                { id: senderId, [`chatHistory.${targetId}.id`]: message.id },
                { $set: { [`chatHistory.${targetId}.$.text`]: message.text, [`chatHistory.${targetId}.$.isEdited`]: true } }
            );
            // Update receiver's copy
            await User.updateOne(
                { id: targetId, [`chatHistory.${senderId}.id`]: message.id },
                { $set: { [`chatHistory.${senderId}.$.text`]: message.text, [`chatHistory.${senderId}.$.isEdited`]: true } }
            );
            
            io.to(targetId).emit('message_edited', { message });
            io.to(senderId).emit('message_edited', { message }); 
        }
    });
    
    socket.on('delete_message', async ({ messageId, chatId, forEveryone }) => {
        const senderId = userId; // current user
        const targetId = chatId; // in DM, chatId is the other user ID

        if (forEveryone) {
            // Group
            const group = await Group.findOne({ id: chatId });
            if (group) {
                await Group.updateOne({ id: chatId }, { $pull: { chatHistory: { id: messageId } } });
                io.to(chatId).emit('message_deleted', { messageId, chatId });
                return;
            }
            
            // DM
            // Delete from sender
            await User.updateOne({ id: senderId }, { $pull: { [`chatHistory.${targetId}`]: { id: messageId } } });
            // Delete from receiver
            await User.updateOne({ id: targetId }, { $pull: { [`chatHistory.${senderId}`]: { id: messageId } } });
            
            io.to(targetId).emit('message_deleted', { messageId, chatId: senderId });
            io.to(senderId).emit('message_deleted', { messageId, chatId: targetId });
        } else {
            // Local delete only
            // Client handles UI, server just ensures sync for this user
            // We assume client already called API to clear or handled it locally? 
            // Actually, for single message local delete, usually we just update that user's document.
            // But here we'll just do it for sender.
             await User.updateOne({ id: senderId }, { $pull: { [`chatHistory.${targetId}`]: { id: messageId } } });
        }
    });

    socket.on('mark_read', async ({ chatId, readerId }) => {
        // Update DB statuses
        // For DM:
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
                updateUserStatus(userId, false); // Mark offline
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
