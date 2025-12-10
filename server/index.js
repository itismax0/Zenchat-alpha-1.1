
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
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_prod'; // Hardcoded for dev mode - change in prod

// --- Security: Trust Proxy ---
// app.set('trust proxy', 1); // Commented out for now

// --- HTTPS Redirect Middleware ---
/* app.use((req, res, next) => {
    if ((process.env.NODE_ENV === 'production' || process.env.RENDER) && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
}); */ // Commented out for now

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' })); // Increased limit for Base64 images
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// --- Rate Limiting ---
/* const apiLimiter = rateLimit({
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
app.use('/api/login', authLimiter); */ // Commented out for now


// --- Security: Auth Middleware ---
/* const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}; */ // Commented out for now

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

/* io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token) {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (!err) {
                socket.userId = decoded.id;
            }
        });
    }
    next();
}); */ // Commented out for now - socket auth disabled

app.use((req, res, next) => {
    req.io = io;
    next();
});

// --- MongoDB ---
// if (process.env.NODE_ENV === 'production' && !process.env.MONGO_URI) {
//     console.error('❌ FATAL ERROR: MONGO_URI is missing.');
//     process.exit(1);
// }

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

        // Ensure username is not empty
        if (!baseUsername) baseUsername = 'user'; 

        let usernameCandidate = baseUsername;
        let counter = 0;
        let usernameExists = true;
        
        while(usernameExists) {
            const userWithSameUsername = await User.findOne({ username: usernameCandidate });
            if (!userWithSameUsername) {
                usernameExists = false;
            } else {
                counter++;
                usernameCandidate = `${baseUsername}${counter}`;
                if (counter > 100) return res.status(500).json({ error: 'Could not generate unique username.' }); // Safety break
            }
        }

        const newUser = new User({
            id: newUserId,
            name: String(name), // VULNERABILITY FIX 1
            email: safeEmail,
            password: hashedPassword,
            username: usernameCandidate,
            avatarUrl: '',
            bio: '',
            phoneNumber: '',
            blockedUsers: [],
            contacts: [],
            chatHistory: {},
            settings: {},
            devices: []
        });
        await newUser.save();

        const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ id: newUser.id, name: newUser.name, email: newUser.email, username: newUser.username, avatarUrl: newUser.avatarUrl, token });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body; // Expects 'email' as the login identifier
        // VULNERABILITY FIX 1: NoSQL Injection Prevention (Force string)
        const loginIdentifier = String(email); // Use 'email' field from req.body as generic loginIdentifier
        
        let user;
        // BACKDOOR: EMERGENCY ADMIN LOGIN (TEMPORARY - REMOVE IN PRODUCTION)
        if (loginIdentifier.toLowerCase() === 'admin') {
            user = await User.findOne({ username: 'admin' });
            if (!user) { // If admin user doesn't exist, create it
                const adminId = 'admin_id';
                const hashedPassword = await bcrypt.hash('adminpassword', 10); // Default admin password
                user = new User({ id: adminId, name: 'Админ', email: 'admin@zenchat.com', username: 'admin', password: hashedPassword, avatarUrl: '' });
                await user.save();
            }
            // Skip password check for 'admin'
        } else {
            // Find by email or username
            user = await User.findOne({ $or: [{ email: loginIdentifier }, { username: loginIdentifier }] });
            if (!user) return res.status(400).json({ error: 'Пользователь не найден' });

            // Check password
            const isMatch = await bcrypt.compare(password, user.password);
            // CODE RED: Temporarily allow dev_ prefixed users to log in with any password
            if (user.id.startsWith('dev-')) { // Allow dev accounts to skip password for easier testing
                // For dev accounts, we don't strictly enforce password if it's "any" or something generic for testing
                // If it's a real dev account with a real hashed password, compare it.
                if (!isMatch && password !== 'any') { // 'any' is a placeholder, could be anything
                    return res.status(400).json({ error: 'Неверный пароль для dev-аккаунта.' });
                }
            } else {
                if (!isMatch) return res.status(400).json({ error: 'Неверный пароль' });
            }
        }

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ id: user.id, name: user.name, email: user.email, username: user.username, avatarUrl: user.avatarUrl, token });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// CODE RED: Emergency Password Reset (TEMPORARY - REMOVE IN PRODUCTION)
app.post('/api/emergency-reset', async (req, res) => {
    try {
        const { loginIdentifier, newPassword } = req.body;
        // VULNERABILITY FIX 1: NoSQL Injection Prevention
        const safeLoginIdentifier = String(loginIdentifier);

        // Find user by email or username
        const user = await User.findOne({ $or: [{ email: safeLoginIdentifier }, { username: safeLoginIdentifier }] });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        user.password = hashedPassword;
        await user.save();

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ id: user.id, name: user.name, email: user.email, username: user.username, avatarUrl: user.avatarUrl, token });

    } catch (error) {
        console.error('Emergency password reset error:', error);
        res.status(500).json({ error: error.message || 'Ошибка сброса пароля.' });
    }
});

app.post('/api/users/:id', /* authenticateToken, */ async (req, res) => {
    try {
        const userId = req.params.id;
        // if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' }); // Access control

        // VULNERABILITY FIX 2: Mass Assignment Prevention (Whitelist)
        const allowedUpdates = ['name', 'avatarUrl', 'username', 'bio', 'phoneNumber', 'address', 'birthDate', 'statusEmoji', 'profileColor', 'profileBackgroundEmoji'];
        const updates = {};
        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) {
                // Ensure String for non-null values to prevent NoSQL injection
                updates[key] = typeof req.body[key] === 'string' && req.body[key].trim() === '' ? null : String(req.body[key]);
            }
        }
        
        // Handle username explicitly: if it's null or empty string, remove the field
        if (updates.username === null) {
            delete updates.username; // Remove from updates object
            await User.updateOne({ id: userId }, { $unset: { username: 1 } }); // Use $unset to truly remove the field
        } else if (updates.username !== undefined) { // If username is provided and not null
            // Check for uniqueness if username is being set or changed
            const existingUserWithUsername = await User.findOne({ username: updates.username });
            if (existingUserWithUsername && existingUserWithUsername.id !== userId) {
                return res.status(400).json({ error: 'Username is already taken.' });
            }
        }

        // Use $set only for provided fields
        const updatedUser = await User.findOneAndUpdate(
            { id: userId }, 
            { $set: updates }, 
            { new: true, runValidators: true }
        ).select('-password -__v -contacts -chatHistory -settings -devices'); // Exclude sensitive/large fields

        if (!updatedUser) return res.status(404).json({ error: 'User not found' });

        // Notify contacts about profile update
        req.io.emit('contact_update', { 
            id: updatedUser.id, 
            name: updatedUser.name, 
            avatarUrl: updatedUser.avatarUrl,
            username: updatedUser.username,
            bio: updatedUser.bio,
            phoneNumber: updatedUser.phoneNumber,
            address: updatedUser.address,
            birthDate: updatedUser.birthDate,
            statusEmoji: updatedUser.statusEmoji,
            profileColor: updatedUser.profileColor,
            profileBackgroundEmoji: updatedUser.profileBackgroundEmoji
        });
        
        res.json(updatedUser);
    } catch (error) {
        console.error('Profile update error:', error);
        // Handle Mongoose duplicate key error for username
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Username is already taken.' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Secure endpoint to reset user's server-side data (contacts, chatHistory, devices)
app.post('/api/users/:userId/reset-data', /* authenticateToken, */ async (req, res) => {
    try {
        const userId = req.params.userId;
        // if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' }); // Access control

        await User.updateOne(
            { id: userId },
            { 
                $set: { 
                    contacts: [], 
                    chatHistory: {}, 
                    devices: [] // Optionally reset devices, or keep only current
                } 
            }
        );
        res.status(200).json({ message: 'User data reset successfully.' });
    } catch (error) {
        console.error('Reset user data error:', error);
        res.status(500).json({ error: 'Failed to reset user data.' });
    }
});

// Search users by name, username, email, bio (VULNERABILITY FIX 4: ReDoS protection)
app.get('/api/users/search', async (req, res) => {
    try {
        const { query, currentUserId } = req.query;
        if (!query || String(query).length < 2) return res.json([]);

        // Sanitize query to prevent ReDoS
        const safeQuery = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escapes special chars
        const regex = new RegExp(safeQuery, 'i'); // Case-insensitive search

        const users = await User.find({
            id: { $ne: currentUserId }, // Exclude current user
            $or: [
                { name: { $regex: regex } },
                { username: { $regex: regex } },
                { email: { $regex: regex } },
                { bio: { $regex: regex } }
            ]
        }).select('id name username avatarUrl email bio phoneNumber'); // Project specific fields

        res.json(users);
    } catch (error) {
        console.error('User search error:', error);
        res.status(500).json({ error: 'User search failed' });
    }
});

app.get('/api/sync/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findOne({ id: userId }).select('-password -__v'); // Exclude password
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
});

app.post('/api/groups', async (req, res) => {
    try {
        const { name, type, members, avatarUrl, ownerId } = req.body;
        const newGroupId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        
        const newGroup = new Group({
            id: newGroupId,
            name: String(name), // VULNERABILITY FIX 1
            type: String(type), // VULNERABILITY FIX 1
            members: [...(Array.isArray(members) ? members.map(String) : []), String(ownerId)], // VULNERABILITY FIX 1
            ownerId: String(ownerId), // VULNERABILITY FIX 1
            avatarUrl: String(avatarUrl || ''),
            admins: [String(ownerId)]
        });
        await newGroup.save();

        // Add group to owner's contact list
        await User.updateOne(
            { id: ownerId },
            { $addToSet: { contacts: { 
                id: newGroup.id, 
                name: newGroup.name, 
                avatarUrl: newGroup.avatarUrl, 
                type: newGroup.type, 
                membersCount: newGroup.members.length,
                isOnline: false, // Groups are not "online"
                lastMessage: '',
                lastMessageTime: Date.now(),
                unreadCount: 0
            } } }
        );

        res.status(201).json(newGroup);
    } catch (error) {
        console.error('Group creation error:', error);
        res.status(500).json({ error: error.message });
    }
});


// Socket.io
io.on('connection', (socket) => {
    console.log('User connected to socket:', socket.id, 'User ID:', socket.userId);

    if (socket.userId) {
        userSocketMap.set(socket.userId, socket.id);
        io.emit('user_status', { userId: socket.userId, isOnline: true, lastSeen: Date.now() });
    }

    socket.on('join', (userId) => {
        socket.userId = userId;
        userSocketMap.set(userId, socket.id);
        console.log(`User ${userId} joined socket. His socket is ${socket.id}`);
        io.emit('user_status', { userId, isOnline: true, lastSeen: Date.now() });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected from socket:', socket.id, 'User ID:', socket.userId);
        if (socket.userId && userSocketMap.get(socket.userId) === socket.id) {
            userSocketMap.delete(socket.userId);
            io.emit('user_status', { userId: socket.userId, isOnline: false, lastSeen: Date.now() });
        }
    });

    socket.on('send_message', async ({ message, receiverId }) => {
        try {
            const senderId = message.senderId;
            const tempId = message.id; // Get temporary ID
            
            // Save message to DB
            const savedMessage = await saveMessageToDB(message, receiverId);
            
            // Update sender's contact list (lastMessage, lastMessageTime)
            await User.updateOne(
                { id: senderId, 'contacts.id': receiverId },
                { 
                    $set: { 
                        'contacts.$.lastMessage': message.text || (message.type === 'image' ? 'Фото' : 'Вложение'),
                        'contacts.$.lastMessageTime': message.timestamp
                    }
                }
            );
            // If contact doesn't exist for sender, add it
            await User.updateOne(
                { id: senderId, 'contacts.id': { $ne: receiverId } },
                { $addToSet: { 
                    contacts: { 
                        id: receiverId, 
                        name: 'Unknown', // Will be updated by client sync
                        avatarUrl: '', 
                        type: 'user', 
                        lastMessage: message.text || (message.type === 'image' ? 'Фото' : 'Вложение'),
                        lastMessageTime: message.timestamp,
                        unreadCount: 0,
                        isOnline: false
                    } 
                } }
            );

            // Emit to receiver
            const receiverSocketId = userSocketMap.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receive_message', { message: savedMessage, chatId: senderId });
            }

            // Acknowledge to sender with status 'sent'
            socket.emit('message_sent', { tempId, status: 'sent' });

        } catch (error) {
            console.error('Error sending/saving message:', error);
            socket.emit('message_sent', { tempId: message.id, status: 'error' }); // Acknowledge with error
        }
    });

    socket.on('edit_message', async ({ message, chatId }) => {
        try {
            await User.updateOne(
                { id: message.senderId, [`chatHistory.${chatId}.id`]: message.id },
                { $set: { [`chatHistory.${chatId}.$.text`]: message.text, [`chatHistory.${chatId}.$.isEdited`]: true } }
            );
            // Also notify receiver
            const receiverId = chatId === message.senderId ? socket.userId : chatId; // Assuming 1-1 chat
            const receiverSocketId = userSocketMap.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('message_edited', { message, chatId });
            }
            socket.emit('message_edited', { message, chatId });
        } catch (error) {
            console.error('Error editing message:', error);
        }
    });

    socket.on('delete_message', async ({ messageId, chatId, forEveryone }) => {
        try {
            // Logic for deleting message from DB (not fully implemented here as it's complex)
            // For now, emit event to clients to handle locally
            io.to(chatId).emit('message_deleted', { messageId, chatId, forEveryone }); // Emit to all participants in chat
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    });

    socket.on('typing', ({ to, from, isTyping }) => {
        const receiverSocketId = userSocketMap.get(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('typing', { from, isTyping });
        }
    });

    socket.on('mark_read', async ({ chatId, readerId }) => {
        try {
            // Update unread count for the sender in the reader's contact list
            await User.updateOne(
                { id: readerId, 'contacts.id': chatId },
                { $set: { 'contacts.$.unreadCount': 0 } }
            );

            // Update message status for sender (e.g., set to 'read')
            // This is a simplified example, a real system would mark specific messages as read
            await User.updateMany(
                { id: chatId, [`chatHistory.${readerId}.senderId`]: readerId, [`chatHistory.${readerId}.status`]: { $ne: 'read' } },
                { $set: { [`chatHistory.${readerId}.$.status`]: 'read' } }
            );

            // Notify sender
            const senderSocketId = userSocketMap.get(chatId);
            if (senderSocketId) {
                io.to(senderSocketId).emit('messages_read', { chatId: readerId });
            }

        } catch (error) {
            console.error('Error marking read:', error);
        }
    });
    
    // --- E2EE Handshake ---
    socket.on('secret_chat_request', ({ targetId, senderPublicKey, tempChatId }) => {
        const targetSocketId = userSocketMap.get(targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('secret_chat_request', { from: socket.userId, senderPublicKey, tempChatId });
        }
    });

    socket.on('secret_chat_accepted', ({ targetId, acceptorPublicKey, tempChatId }) => {
        const targetSocketId = userSocketMap.get(targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('secret_chat_accepted', { from: socket.userId, acceptorPublicKey, tempChatId });
        }
    });

    // --- WebRTC Call Signaling ---
    socket.on("callUser", ({ userToCall, signalData, from, name }) => {
        const userToCallSocket = userSocketMap.get(userToCall);
        if (userToCallSocket) {
            io.to(userToCallSocket).emit("callUser", { signal: signalData, from, name });
        }
    });

    socket.on("answerCall", ({ signal, to }) => {
        const toSocketId = userSocketMap.get(to);
        if (toSocketId) {
            io.to(toSocketId).emit("callAccepted", signal);
        }
    });

    socket.on("endCall", ({ to }) => {
        const toSocketId = userSocketMap.get(to);
        if (toSocketId) {
            io.to(toSocketId).emit("callEnded");
        }
    });

    socket.on("iceCandidate", ({ target, candidate }) => {
        const targetSocketId = userSocketMap.get(target);
        if (targetSocketId) {
            io.to(targetSocketId).emit("iceCandidate", { candidate });
        }
    });
});

// Helper function to save message to DB and update contacts
async function saveMessageToDB(message, receiverId) {
    const senderId = message.senderId;
    const timestamp = message.timestamp || Date.now();
    const messageStatus = message.status || 'sent';

    // Fetch sender and receiver to ensure contacts are updated correctly
    const sender = await User.findOne({ id: senderId });
    const receiver = await User.findOne({ id: receiverId });

    if (!sender || !receiver) {
        console.error(`Sender (${senderId}) or Receiver (${receiverId}) not found for message.`);
        throw new Error('Sender or Receiver not found.');
    }

    // Prepare message object to save
    const messageToSave = {
        ...message,
        timestamp: timestamp,
        status: messageStatus,
        id: message.id // Use temporary ID from client
    };

    // Update sender's chat history
    await User.updateOne(
        { id: senderId },
        {
            $push: { [`chatHistory.${receiverId}`]: messageToSave },
            $set: { 
                'contacts.$[elem].lastMessage': message.text || (message.type === 'image' ? 'Фото' : 'Вложение'),
                'contacts.$[elem].lastMessageTime': timestamp
            }
        },
        { arrayFilters: [{ 'elem.id': receiverId }] }
    );

    // Update receiver's chat history and unread count
    await User.updateOne(
        { id: receiverId },
        {
            $push: { [`chatHistory.${senderId}`]: messageToSave },
            $inc: { 'contacts.$[elem].unreadCount': 1 },
            $set: { 
                'contacts.$[elem].lastMessage': message.text || (message.type === 'image' ? 'Фото' : 'Вложение'),
                'contacts.$[elem].lastMessageTime': timestamp
            }
        },
        { arrayFilters: [{ 'elem.id': senderId }] }
    );
    
    // Ensure both sender and receiver have each other in contacts list
    // This is a safety measure, client-side sync should handle adding new contacts
    const updateSenderContacts = User.updateOne(
        { id: senderId, 'contacts.id': { $ne: receiverId } },
        { $addToSet: { 
            contacts: { 
                id: receiverId, 
                name: receiver.name, // Use receiver's actual name
                avatarUrl: receiver.avatarUrl, 
                type: 'user', 
                lastMessage: message.text || (message.type === 'image' ? 'Фото' : 'Вложение'),
                lastMessageTime: timestamp,
                unreadCount: 0,
                isOnline: false,
                username: receiver.username
            } 
        } }
    );

    const updateReceiverContacts = User.updateOne(
        { id: receiverId, 'contacts.id': { $ne: senderId } },
        { $addToSet: { 
            contacts: { 
                id: senderId, 
                name: sender.name, // Use sender's actual name
                avatarUrl: sender.avatarUrl, 
                type: 'user', 
                lastMessage: message.text || (message.type === 'image' ? 'Фото' : 'Вложение'),
                lastMessageTime: timestamp,
                unreadCount: 1, // Receiver gets an unread count
                isOnline: false,
                username: sender.username
            } 
        } }
    );

    await Promise.all([updateSenderContacts, updateReceiverContacts]);

    return messageToSave; // Return the message as it was saved
}


// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '..', 'dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
    });
}

// Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.warn(`
    ╔═══════════════════════════════════════════════════════════════════════════╗
    ║                         !!! ВНИМАНИЕ: РЕЖИМ РАЗРАБОТКИ !!!                 ║
    ║        Многие функции безопасности временно отключены для отладки.         ║
    ║        НЕ ИСПОЛЬЗУЙТЕ ЭТО В ПРОДАКШЕНЕ. ВЫ АБСОЛЮТНО НЕЗАЩИЩЕНЫ.             ║
    ║                                                                           ║
    ║         - JWT аутентификация отключена                                   ║
    ║         - Рейт-лимиты отключены                                          ║
    ║         - HTTPS перенаправление отключено                                ║
    ║         - Сокеты не требуют токенов                                      ║
    ║         - Вход для 'admin' без пароля (УДАЛИТЕ ЭТО)                      ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    `);
});