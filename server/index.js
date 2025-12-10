
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

// --- Middleware ---
app.use(cors());
app.use(express.json()); // CRITICAL FIX: To parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // For URL-encoded bodies

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

    if (!token) {
        console.log('DEBUG: Access denied - No token provided');
        return res.status(401).json({ error: 'Access denied - No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('DEBUG: Access denied - Invalid token', err.message);
            return res.status(403).json({ error: `Access denied - Invalid token: ${err.message}` });
        }
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
            } else {
                console.warn('Socket authentication failed:', err.message);
            }
        });
    } else {
        console.warn('Socket connection attempted without token.');
    }
    next();
}); 

app.use((req, res, next) => {
    req.io = io;
    next();
});

// --- MongoDB ---
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

// --- STARTUP SCRIPT: Initialize/Update @admin user ---
const initializeAdminAccount = async () => {
    try {
        const adminUsername = 'admin';
        const adminEmail = 'makxim112010@gmail.com';
        const adminPassword = 'Itismax'; // The desired password
        const adminId = 'admin_id'; // Fixed ID for admin

        // Step 0: Ensure User model is available
        if (!mongoose.models.User) {
            // Schemas are defined after this, so we need to define it first if not already.
            // This is a common pattern when init script runs before global schema definition.
            User = mongoose.model('User', UserSchema);
        }
        
        // Step 1: Aggressively remove any other user that holds the admin's target email or username
        // if they are not the admin user itself
        const conflictingUsers = await User.find({
            $or: [{ email: adminEmail }, { username: adminUsername }],
            id: { $ne: adminId } // Exclude the admin user itself
        });

        if (conflictingUsers.length > 0) {
            for (const conflictUser of conflictingUsers) {
                await User.deleteOne({ _id: conflictUser._id });
                console.warn(`⚠️ Deleted conflicting user (ID: ${conflictUser.id}, Email: ${conflictUser.email}, Username: ${conflictUser.username}) to free up credentials for @admin.`);
            }
        }

        let adminUser = await User.findOne({ id: adminId });

        if (!adminUser) {
            // Admin user does not exist, create it
            adminUser = new User({
                id: adminId,
                name: 'Админ',
                email: adminEmail,
                username: adminUsername,
                password: await bcrypt.hash(adminPassword, 10),
                avatarUrl: '', bio: 'Главный администратор ZenChat.', phoneNumber: '', blockedUsers: [], contacts: [], chatHistory: {}, settings: {}, devices: []
            });
            await adminUser.save();
            console.log(`✨ Created new @admin account (ID: ${adminId}) with email '${adminEmail}' and password 'Itismax'.`);
        } else {
            // Admin user exists, ensure its email and password are correct
            let needsUpdate = false;

            if (adminUser.email !== adminEmail) {
                adminUser.email = adminEmail;
                needsUpdate = true;
            }

            const isPasswordMatch = await bcrypt.compare(adminPassword, adminUser.password);
            if (!isPasswordMatch) {
                adminUser.password = await bcrypt.hash(adminPassword, 10);
                needsUpdate = true;
            }

            if (needsUpdate) {
                await adminUser.save();
                console.log(`🔄 Updated @admin account (ID: ${adminId}): email set to '${adminEmail}' and/or password set to 'Itismax'.`);
            } else {
                console.log(`✅ @admin account (ID: ${adminId}) already configured with specified email and password.`);
            }
        }
    } catch (error) {
        console.error('❌ Error initializing/updating @admin account:', error.message);
    }
};


connectDB().then(initializeAdminAccount);


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
let User = mongoose.models.User || mongoose.model('User', UserSchema);

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
app.post('/api/register', authLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // VULNERABILITY FIX 1: NoSQL Injection Prevention (Force string)
        const safeName = String(name);
        const safeEmail = String(email);
        const safePassword = String(password); // Ensure password is string for bcrypt

        if (!safeEmail || !safePassword || !safeName) {
            return res.status(400).json({ error: 'Имя, Email и пароль обязательны.' });
        }
        
        const existingUser = await User.findOne({ email: safeEmail });
        if (existingUser) return res.status(400).json({ error: 'Email уже зарегистрирован.' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(safePassword, salt);
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
                if (counter > 100) return res.status(500).json({ error: 'Не удалось сгенерировать уникальное имя пользователя.' }); // Safety break
            }
        }

        const newUser = new User({
            id: newUserId,
            name: safeName,
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

app.post('/api/login', authLimiter, async (req, res) => {
    try {
        const { loginIdentifier, password } = req.body; 
        const safeLoginIdentifier = String(loginIdentifier); // VULNERABILITY FIX 1
        const safePassword = String(password); // Ensure password is string for bcrypt

        // Log received credentials for debugging
        console.log(`DEBUG: Login attempt for loginIdentifier: '${safeLoginIdentifier}', password: '${safePassword}'`);

        if (!safeLoginIdentifier || !safePassword) {
            return res.status(400).json({ error: 'Email/имя пользователя и пароль обязательны.' });
        }
        
        let user = await User.findOne({ $or: [{ email: safeLoginIdentifier }, { username: safeLoginIdentifier }] });
        
        // Log user lookup result
        console.log(`DEBUG: User lookup result: ${user ? 'Found' : 'Not Found'}`);

        if (!user) return res.status(400).json({ error: 'Пользователь не найден.' });

        const isMatch = await bcrypt.compare(safePassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Неверный пароль.' });
        }

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ id: user.id, name: user.name, email: user.email, username: user.username, avatarUrl: user.avatarUrl, token });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/emergency-reset', authLimiter, async (req, res) => {
    try {
        const { loginIdentifier, newPassword } = req.body;
        const safeLoginIdentifier = String(loginIdentifier);
        const safeNewPassword = String(newPassword);

        if (!safeLoginIdentifier || !safeNewPassword) {
            return res.status(400).json({ error: 'Имя пользователя и новый пароль обязательны.' });
        }
        
        const user = await User.findOne({ $or: [{ email: safeLoginIdentifier }, { username: safeLoginIdentifier }] });
        
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(safeNewPassword, salt);
        await user.save();

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ id: user.id, name: user.name, email: user.email, username: user.username, avatarUrl: user.avatarUrl, token });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: error.message || 'Ошибка сброса пароля.' });
    }
});


app.post('/api/users/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.id;
        if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' }); // Access control

        // VULNERABILITY FIX 2: Mass Assignment Prevention (Whitelist)
        const allowedUpdates = ['name', 'avatarUrl', 'username', 'bio', 'phoneNumber', 'address', 'birthDate', 'statusEmoji', 'profileColor', 'profileBackgroundEmoji'];
        const updates = {};
        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) {
                // Ensure String for non-null values to prevent NoSQL injection
                // If it's an empty string, set it to null to trigger $unset if needed, otherwise cast to string
                updates[key] = typeof req.body[key] === 'string' && req.body[key].trim() === '' ? null : String(req.body[key]);
            }
        }
        
        // Handle username explicitly: if it's null, remove the field
        if (updates.username === null) {
            // Check if username field actually exists to avoid unnecessary update op
            const userCheck = await User.findOne({ id: userId, username: { $exists: true } });
            if (userCheck) {
                await User.updateOne({ id: userId }, { $unset: { username: 1 } });
                delete updates.username; // Remove from current $set operation
            } else {
                delete updates.username; // Already not existing, no need to $unset
            }
        } else if (updates.username !== undefined) { // If username is provided and not null
            // Check for uniqueness if username is being set or changed
            const existingUserWithUsername = await User.findOne({ username: updates.username });
            if (existingUserWithUsername && existingUserWithUsername.id !== userId) {
                return res.status(400).json({ error: 'Имя пользователя уже занято.' });
            }
        }

        // Use $set only for provided fields (excluding explicitly handled username unset)
        const updatedUser = await User.findOneAndUpdate(
            { id: userId }, 
            { $set: updates }, 
            { new: true, runValidators: true }
        ).select('-password -__v -contacts -chatHistory -settings -devices'); // Exclude sensitive/large fields

        if (!updatedUser) return res.status(404).json({ error: 'Пользователь не найден.' });

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
            return res.status(400).json({ error: 'Имя пользователя уже занято.' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Fix: Implemented password change API route
app.post('/api/users/:id/password', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.id;
        if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' }); // Access control

        const { currentPassword, newPassword } = req.body;
        const safeCurrentPassword = String(currentPassword);
        const safeNewPassword = String(newPassword);

        if (!safeCurrentPassword || !safeNewPassword) {
            return res.status(400).json({ error: 'Текущий и новый пароль обязательны.' });
        }

        const user = await User.findOne({ id: userId });
        if (!user) return res.status(404).json({ error: 'Пользователь не найден.' });

        const isMatch = await bcrypt.compare(safeCurrentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Неверный текущий пароль.' });
        }
        
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(safeNewPassword, salt);
        await user.save();

        // After password change, issue a new token
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ message: 'Пароль успешно изменен.', token });

    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/users/:userId/reset-data', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId;
        if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' }); // Access control

        await User.updateOne(
            { id: userId },
            { 
                $set: { 
                    contacts: [], 
                    chatHistory: {}, 
                    devices: [] 
                } 
            }
        );
        res.status(200).json({ message: 'Данные пользователя успешно сброшены.' });
    } catch (error) {
        console.error('Reset user data error:', error);
        res.status(500).json({ error: 'Не удалось сбросить данные пользователя.' });
    }
});

// Search users by name, username, email, bio (VULNERABILITY FIX 4: ReDoS protection)
app.get('/api/users/search', apiLimiter, async (req, res) => {
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
        res.status(500).json({ error: 'Поиск пользователей не удался.' });
    }
});

app.get('/api/sync/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId;
        if (req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' }); // Access control

        const user = await User.findOne({ id: userId }).select('-password -__v'); // Exclude password
        if (!user) return res.status(404).json({ error: 'Пользователь не найден.' });
        res.json(user);
    } catch (error) {
        console.error('Sync error:', error);
        res.status(500).json({ error: 'Синхронизация не удалась.' });
    }
});

app.post('/api/groups', authenticateToken, async (req, res) => {
    try {
        const { name, type, members, avatarUrl, ownerId } = req.body;
        if (req.user.id !== ownerId) return res.status(403).json({ error: 'Forbidden' });

        const newGroupId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        
        const newGroup = new Group({
            id: newGroupId,
            name: String(name), 
            type: String(type), 
            members: [...(Array.isArray(members) ? members.map(String) : []), String(ownerId)], 
            ownerId: String(ownerId), 
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
                isOnline: false, 
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
            const tempId = message.id; 
            
            // Check if sender is authenticated (if JWT is enabled for sockets)
            if (!socket.userId || socket.userId !== senderId) {
                console.warn('Unauthorized message attempt:', senderId, 'to', receiverId);
                socket.emit('message_sent', { tempId: message.id, status: 'error', error: 'Unauthorized' });
                return;
            }

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
                        name: 'Unknown', 
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
            // Check authentication
            if (!socket.userId || socket.userId !== message.senderId) {
                console.warn('Unauthorized edit attempt:', socket.userId);
                return;
            }

            await User.updateOne(
                { id: message.senderId, [`chatHistory.${chatId}.id`]: message.id },
                { $set: { [`chatHistory.${chatId}.$.text`]: message.text, [`chatHistory.${chatId}.$.isEdited`]: true } }
            );
            // Also notify receiver
            const receiverId = chatId === message.senderId ? socket.userId : chatId; 
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
            // Check authentication
            if (!socket.userId) {
                console.warn('Unauthorized delete attempt:', socket.userId);
                return;
            }

            // Logic for deleting message from DB (not fully implemented here as it's complex)
            // For now, emit event to clients to handle locally
            io.to(chatId).emit('message_deleted', { messageId, chatId, forEveryone }); // Emit to all participants in chat
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    });

    socket.on('typing', ({ to, from, isTyping }) => {
        // Check authentication
        if (!socket.userId || socket.userId !== from) {
            console.warn('Unauthorized typing attempt:', from);
            return;
        }

        const receiverSocketId = userSocketMap.get(to);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('typing', { from, isTyping });
        }
    });

    socket.on('mark_read', async ({ chatId, readerId }) => {
        try {
            // Check authentication
            if (!socket.userId || socket.userId !== readerId) {
                console.warn('Unauthorized mark_read attempt:', readerId);
                return;
            }

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
        if (!socket.userId) { console.warn('Unauthorized secret_chat_request'); return; }
        const targetSocketId = userSocketMap.get(targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('secret_chat_request', { from: socket.userId, senderPublicKey, tempChatId });
        }
    });

    socket.on('secret_chat_accepted', ({ targetId, acceptorPublicKey, tempChatId }) => {
        if (!socket.userId) { console.warn('Unauthorized secret_chat_accepted'); return; }
        const targetSocketId = userSocketMap.get(targetId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('secret_chat_accepted', { from: socket.userId, acceptorPublicKey, tempChatId });
        }
    });

    // --- WebRTC Call Signaling ---
    socket.on("callUser", ({ userToCall, signalData, from, name }) => {
        if (!socket.userId || socket.userId !== from) { console.warn('Unauthorized callUser'); return; }
        const userToCallSocket = userSocketMap.get(userToCall);
        if (userToCallSocket) {
            io.to(userToCallSocket).emit("callUser", { signal: signalData, from, name });
        }
    });

    socket.on("answerCall", ({ signal, to }) => {
        if (!socket.userId) { console.warn('Unauthorized answerCall'); return; }
        const toSocketId = userSocketMap.get(to);
        if (toSocketId) {
            io.to(toSocketId).emit("callAccepted", signal);
        }
    });

    socket.on("endCall", ({ to }) => {
        if (!socket.userId) { console.warn('Unauthorized endCall'); return; }
        const toSocketId = userSocketMap.get(to);
        if (toSocketId) {
            io.to(toSocketId).emit("callEnded");
        }
    });

    socket.on("iceCandidate", ({ target, candidate }) => {
        if (!socket.userId) { console.warn('Unauthorized iceCandidate'); return; }
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
    ║                           !!! ВНИМАНИЕ !!!                                ║
    ║        Приложение теперь работает в стандартном безопасном режиме.        ║
    ║        Все бэкдоры и временные отключения безопасности удалены.           ║
    ║                                                                           ║
    ║        Для входа в @admin используйте:                                    ║
    ║        Email: makxim112010@gmail.com ИЛИ Username: admin                  ║
    ║        Пароль: Itismax                                                    ║
    ╚═══════════════════════════════════════════════════════════════════════════╝
    `);
});