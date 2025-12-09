
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Environment
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/zenchat_local'; // Fallback for local testing

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase payload limit for images

// --- Socket.io Setup (Early Init to use in routes) ---
const io = new Server(server, {
    maxHttpBufferSize: 1e8,
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Attach io to request for use in API routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// --- MongoDB Connection ---
if (MONGO_URI.includes('<password>')) {
    console.error('================================================================');
    console.error('❌ CRITICAL ERROR: Invalid MONGO_URI');
    console.error('You forgot to replace <password> with your actual password in the connection string.');
    console.error('Please go to Render Environment Variables and fix MONGO_URI.');
    console.error('It should look like: mongodb+srv://user:mypassword123@...');
    console.error('================================================================');
}

const connectDB = async () => {
    try {
        await mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
    }
};
connectDB();

// --- Mongoose Schemas ---

const UserSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, 
    name: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    username: { type: String, unique: true, sparse: true }, 
    avatarUrl: String,
    bio: String,
    phoneNumber: String,
    address: String,   // New field
    birthDate: String, // New field
    
    // Customization
    statusEmoji: String,
    profileColor: String,
    profileBackgroundEmoji: String,
    
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

// --- Routes ---

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const newUser = new User({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name,
            email,
            password,
            avatarUrl: '',
        });

        await newUser.save();

        const { password: _, _id, __v, ...userProfile } = newUser.toObject();
        res.json(userProfile);
    } catch (e) {
        console.error("Registration Error:", e);
        const msg = e.code === 11000 ? 'Username or Email already taken' : 'Server error during registration';
        res.status(500).json({ error: msg });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (user.password !== password) {
             return res.status(401).json({ error: 'Invalid email or password' });
        }

        const { password: _, _id, __v, ...userProfile } = user.toObject();
        res.json(userProfile);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Update Profile
app.post('/api/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (updates.username) {
            const taken = await User.findOne({ username: updates.username, id: { $ne: id } });
            if (taken) return res.status(400).json({ error: 'Username taken' });
        }

        const user = await User.findOneAndUpdate(
            { id: id },
            { $set: updates },
            { new: true }
        );

        if (!user) return res.status(404).json({ error: 'User not found' });

        if (updates.name || updates.avatarUrl) {
            await User.updateMany(
                { "contacts.id": id },
                { 
                    $set: { 
                        "contacts.$.name": user.name,
                        "contacts.$.avatarUrl": user.avatarUrl
                    } 
                }
            );
        }

        // Notify friends about profile update
        const friends = await User.find({ "contacts.id": id }).select('id');
        friends.forEach(friend => {
             req.io.to(friend.id).emit('contact_update', {
                 id: user.id,
                 name: user.name,
                 avatarUrl: user.avatarUrl,
                 bio: user.bio,
                 username: user.username,
                 phoneNumber: user.phoneNumber,
                 address: user.address,
                 birthDate: user.birthDate,
                 statusEmoji: user.statusEmoji,
                 profileColor: user.profileColor,
                 profileBackgroundEmoji: user.profileBackgroundEmoji
             });
        });

        const { password: _, _id, __v, ...userProfile } = user.toObject();
        res.json(userProfile);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Create Group
app.post('/api/groups', async (req, res) => {
    try {
        const { name, type, members, avatarUrl, ownerId, settings } = req.body;
        const allMembers = Array.from(new Set([...members, ownerId]));

        const newGroup = new Group({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            name,
            type: type || 'group',
            avatarUrl: avatarUrl || '',
            members: allMembers,
            admins: [ownerId],
            ownerId,
            settings: settings || {
                historyVisible: true, 
                sendMessages: true,
                autoDeleteMessages: 0
            },
            chatHistory: [{
                id: Date.now().toString(),
                text: type === 'channel' ? 'Канал создан' : 'Группа создана',
                senderId: ownerId,
                timestamp: Date.now(),
                status: 'read',
                type: 'text'
            }]
        });

        await newGroup.save();

        const groupContact = {
            id: newGroup.id,
            name: newGroup.name,
            avatarUrl: newGroup.avatarUrl,
            type: newGroup.type,
            lastMessage: type === 'channel' ? 'Канал создан' : 'Группа создана',
            lastMessageTime: Date.now(),
            unreadCount: 0,
            membersCount: allMembers.length,
            description: type === 'channel' ? 'Канал' : 'Группа'
        };

        allMembers.forEach(memberId => {
            req.io.to(memberId).emit('new_chat', groupContact);
        });

        res.json(newGroup);
    } catch(e) {
        console.error("Create Group Error:", e);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// Search
app.get('/api/users/search', async (req, res) => {
    try {
        const { query, currentUserId } = req.query;
        if (!query) return res.json([]);

        const regex = new RegExp(query, 'i');

        const users = await User.find({
            id: { $ne: currentUserId },
            $or: [
                { name: regex }, 
                { username: regex },
                { email: regex }
            ]
        }).select('id name username avatarUrl bio statusEmoji profileColor profileBackgroundEmoji').limit(20);

        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Search failed' });
    }
});

// Sync Data
app.get('/api/sync/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne({ id: userId });

        if (!user) return res.status(404).json({ error: 'User not found' });

        const { password: _, _id, __v, ...fullData } = user.toObject();

        const groups = await Group.find({ members: userId });
        
        const groupContacts = await Promise.all(groups.map(async (g) => {
            const memberUsers = await User.find({ id: { $in: g.members } }).select('id name avatarUrl');
            const members = memberUsers.map(u => ({
                id: u.id,
                name: u.name,
                avatarUrl: u.avatarUrl,
                role: g.ownerId === u.id ? 'owner' : (g.admins.includes(u.id) ? 'admin' : 'member'),
                lastSeen: 'недавно'
            }));

            const lastMsg = g.chatHistory.length > 0 ? g.chatHistory[g.chatHistory.length - 1] : null;

            return {
                id: g.id,
                name: g.name,
                avatarUrl: g.avatarUrl,
                lastMessage: lastMsg ? (lastMsg.text || 'Вложение') : '',
                lastMessageTime: lastMsg ? lastMsg.timestamp : g.createdAt,
                unreadCount: 0,
                isOnline: false,
                type: g.type,
                membersCount: g.members.length,
                members: members,
                settings: g.settings,
                description: g.type === 'channel' ? 'Канал' : 'Группа'
            };
        }));

        const userContacts = fullData.contacts || [];
        const cleanUserContacts = userContacts.filter(c => c && (c.type === 'user' || c.id === 'saved-messages'));
        
        // Hydrate user contacts with fresh profile data (Bio, Phone, Username, Address, BirthDate, Customization)
        const hydratedUserContacts = await Promise.all(cleanUserContacts.map(async (c) => {
            if (c.id === 'saved-messages' || c.id === 'gemini-ai') return c;
            
            const freshUser = await User.findOne({ id: c.id }).select('bio phoneNumber username address birthDate avatarUrl name statusEmoji profileColor profileBackgroundEmoji');
            if (freshUser) {
                return { 
                    ...c, 
                    bio: freshUser.bio, 
                    phoneNumber: freshUser.phoneNumber, 
                    username: freshUser.username,
                    address: freshUser.address,    // New field synced
                    birthDate: freshUser.birthDate, // New field synced
                    avatarUrl: freshUser.avatarUrl || c.avatarUrl,
                    name: freshUser.name || c.name,
                    statusEmoji: freshUser.statusEmoji,
                    profileColor: freshUser.profileColor,
                    profileBackgroundEmoji: freshUser.profileBackgroundEmoji
                };
            }
            return c;
        }));

        const finalContacts = [...groupContacts, ...hydratedUserContacts];

        const combinedHistory = { ...fullData.chatHistory };
        groups.forEach(g => {
            combinedHistory[g.id] = g.chatHistory;
        });

        res.json({
            profile: {
                id: fullData.id,
                name: fullData.name,
                email: fullData.email,
                avatarUrl: fullData.avatarUrl,
                username: fullData.username,
                bio: fullData.bio,
                phoneNumber: fullData.phoneNumber,
                address: fullData.address,     // New field
                birthDate: fullData.birthDate, // New field
                statusEmoji: fullData.statusEmoji,
                profileColor: fullData.profileColor,
                profileBackgroundEmoji: fullData.profileBackgroundEmoji
            },
            contacts: finalContacts, 
            chatHistory: combinedHistory,
            settings: fullData.settings || {}, 
            devices: fullData.devices || []
        });
    } catch (e) {
        console.error("Sync Error:", e);
        res.status(500).json({ error: 'Sync failed' });
    }
});

app.all('/api/*', (req, res) => {
    res.status(404).json({ error: 'API Endpoint not found' });
});

// --- Socket.io Logic ---

const saveMessageToDB = async (senderId, receiverId, message) => {
    try {
        if (receiverId === 'saved-messages') {
            await User.updateOne(
                { id: senderId }, 
                { $push: { "chatHistory.saved-messages": { ...message, status: 'read' } } }
            );
            return;
        }

        const group = await Group.findOne({ id: receiverId });
        if (group) {
            await Group.updateOne(
                { id: receiverId }, 
                { $push: { chatHistory: message } }
            );
            return;
        }

        const previewText = message.type === 'text' ? message.text : 
                           (message.type === 'image' ? 'Фото' : 
                           (message.type === 'file' ? 'Файл' : 'Вложение'));

        const senderUpdateHistory = User.updateOne(
            { id: senderId },
            { $push: { [`chatHistory.${receiverId}`]: { ...message, status: 'sent' } } }
        );

        const senderUpdateContact = User.updateOne(
            { id: senderId, "contacts.id": receiverId },
            { 
                $set: { 
                    "contacts.$.lastMessage": previewText,
                    "contacts.$.lastMessageTime": message.timestamp
                } 
            }
        );

        const receiverUpdateHistory = User.updateOne(
            { id: receiverId },
            { $push: { [`chatHistory.${senderId}`]: message } }
        );

        const receiverUpdateContact = User.updateOne(
            { id: receiverId, "contacts.id": senderId },
            { 
                $set: { 
                    "contacts.$.lastMessage": previewText,
                    "contacts.$.lastMessageTime": message.timestamp,
                },
                $inc: { "contacts.$.unreadCount": 1 }
            }
        );

        const [sHistory, sContact, rHistory, rContact] = await Promise.all([
            senderUpdateHistory,
            senderUpdateContact,
            receiverUpdateHistory,
            receiverUpdateContact
        ]);

        if (sContact.modifiedCount === 0) {
            const receiverProfile = await User.findOne({ id: receiverId }).select('id name avatarUrl email');
            if (receiverProfile) {
                const newContact = {
                    id: receiverProfile.id,
                    name: receiverProfile.name,
                    avatarUrl: receiverProfile.avatarUrl,
                    type: 'user',
                    lastMessage: previewText,
                    lastMessageTime: message.timestamp,
                    unreadCount: 0,
                    email: receiverProfile.email
                };
                await User.updateOne({ id: senderId }, { $push: { contacts: newContact } });
            }
        }

        if (rContact.modifiedCount === 0) {
            const senderProfile = await User.findOne({ id: senderId }).select('id name avatarUrl email');
            if (senderProfile) {
                const newContact = {
                    id: senderProfile.id,
                    name: senderProfile.name,
                    avatarUrl: senderProfile.avatarUrl,
                    type: 'user',
                    lastMessage: previewText,
                    lastMessageTime: message.timestamp,
                    unreadCount: 1,
                    email: senderProfile.email
                };
                await User.updateOne({ id: receiverId }, { $push: { contacts: newContact } });
            }
        }

    } catch (e) {
        console.error("❌ CRITICAL: Failed to save message to DB:", e);
    }
};

io.on('connection', (socket) => {
    // Keep track of user's active socket
    const { id: socketId } = socket;
    let currentUserId = null;

    socket.on('join', async (userId) => {
        currentUserId = userId;
        socket.join(userId);
        
        // Notify friends that I am online
        try {
            await User.updateOne({ id: userId }, { lastSeen: null }); // Online
            // Find users who have this user in contacts and notify them
            // Optimization: In a real app we'd use a more efficient lookup (e.g. redis)
            const friends = await User.find({ "contacts.id": userId }).select('id');
            friends.forEach(friend => {
                io.to(friend.id).emit('user_status_change', { userId, isOnline: true });
            });
            
            const groups = await Group.find({ members: userId });
            groups.forEach(g => {
                socket.join(g.id);
            });
        } catch (e) {
            console.error("Error joining group rooms", e);
        }
    });

    socket.on('disconnect', async () => {
        if (currentUserId) {
             const now = Date.now();
             await User.updateOne({ id: currentUserId }, { lastSeen: now });
             const friends = await User.find({ "contacts.id": currentUserId }).select('id');
             friends.forEach(friend => {
                io.to(friend.id).emit('user_status_change', { userId: currentUserId, isOnline: false, lastSeen: now });
             });
        }
    });

    socket.on('send_message', async (data) => {
        const { receiverId, message } = data;
        const senderId = message.senderId;

        await saveMessageToDB(senderId, receiverId, message);

        if (receiverId === 'saved-messages') {
            socket.emit('message_sent', { tempId: message.id, status: 'read' });
            return;
        }

        const group = await Group.findOne({ id: receiverId }).select('id');
        if (group) {
             io.to(receiverId).emit('receive_message', { message, chatId: receiverId });
        } else {
             io.to(receiverId).emit('receive_message', { message });
        }
        
        socket.emit('message_sent', { tempId: message.id, status: 'sent' });
    });

    // MARK READ HANDLER
    socket.on('mark_read', async ({ chatId, readerId }) => {
        try {
            const group = await Group.findOne({ id: chatId });
            if (group) {
                // Group logic: Just acknowledge locally for now
            } else {
                // DM logic: Update statuses in DB for sender
                // We update messages sent BY chatId (the other person) TO readerId (me)
                await User.updateOne(
                    { id: chatId, [`chatHistory.${readerId}`]: { $exists: true } },
                    { $set: { [`chatHistory.${readerId}.$[elem].status`]: 'read' } },
                    { arrayFilters: [{ "elem.status": "sent" }] }
                );
                
                io.to(chatId).emit('messages_read', { chatId: readerId }); 
            }
        } catch (e) {
            console.error(e);
        }
    });

    socket.on('typing', ({ to, from, isTyping }) => {
        io.to(to).emit('typing', { from, isTyping });
    });

    socket.on("callUser", ({ userToCall, signalData, from, name }) => {
        io.to(userToCall).emit("callUser", { signal: signalData, from, name });
    });

    socket.on("answerCall", (data) => {
        io.to(data.to).emit("callAccepted", data.signal);
    });

    socket.on("iceCandidate", ({ target, candidate }) => {
        io.to(target).emit("iceCandidate", { candidate });
    });

    socket.on("endCall", ({ to }) => {
        io.to(to).emit("callEnded");
    });
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
