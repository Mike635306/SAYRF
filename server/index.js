const express = require('express');
const fs = require('fs');
const path = require('path');
// Load environment from .env (if present)
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3104;
const { Server } = require("socket.io");
const { createServer } = require("http");
const archiver = require('archiver');
const CryptoJS = require('crypto-js');
const { AuthStore } = require('./authStore');
const nodemailer = require('nodemailer');

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const uploadsDir = path.join(__dirname, 'uploads');
const messagesDir = path.join(__dirname, 'messages');
const globalMessagesDir = path.join(messagesDir, 'global');
const chatsDir = path.join(__dirname, 'chats');
const groupsDir = path.join(__dirname, 'groups');

// Shared encryption key for all clients
const GLOBAL_ENCRYPTION_KEY = 'EyeCode University';
const ENCRYPTION_SCHEMES = ['AES-CBC', 'AES-CFB', 'AES-CTR'];
const ENCODE_PREFIX = 'ENC';

const hexToWordArray = (hex) => CryptoJS.enc.Hex.parse(hex);
const wordArrayToHex = (wordArray) => wordArray.toString(CryptoJS.enc.Hex);
const modeMap = {
  'AES-CBC': CryptoJS.mode.CBC,
  'AES-CFB': CryptoJS.mode.CFB,
  'AES-CTR': CryptoJS.mode.CTR,
};

const deriveEncryptionParams = (pass, saltHex = null) => {
  if (saltHex) {
    const salt = hexToWordArray(saltHex);
    const key = CryptoJS.PBKDF2(pass, salt, { keySize: 256 / 32, iterations: 1200 });
    return { key };
  }
  return {
    key: CryptoJS.SHA256(pass),
    iv: CryptoJS.MD5(pass),
  };
};

const encryptText = (text, pass = GLOBAL_ENCRYPTION_KEY) => {
  if (typeof text !== 'string') return text;
  const scheme = ENCRYPTION_SCHEMES[Math.floor(Math.random() * ENCRYPTION_SCHEMES.length)];
  const salt = CryptoJS.lib.WordArray.random(8);
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = deriveEncryptionParams(pass, wordArrayToHex(salt)).key;
  const encrypted = CryptoJS.AES.encrypt(text, key, {
    iv,
    mode: modeMap[scheme],
    padding: CryptoJS.pad.Pkcs7,
  });
  const cipherBase64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
  return `${ENCODE_PREFIX}|${scheme}|${wordArrayToHex(salt)}|${wordArrayToHex(iv)}|${cipherBase64}`;
};

const decryptText = (cipher, pass = GLOBAL_ENCRYPTION_KEY) => {
  if (typeof cipher !== 'string') return cipher;

  const tryStructured = (value) => {
    const parts = value.split('|');
    if (parts.length !== 5 || parts[0] !== ENCODE_PREFIX) return null;
    const [, scheme, saltHex, ivHex, cipherBase64] = parts;
    if (!modeMap[scheme]) return null;
    try {
      const key = deriveEncryptionParams(pass, saltHex).key;
      const iv = hexToWordArray(ivHex);
      const ciphertext = CryptoJS.enc.Base64.parse(cipherBase64);
      const bytes = CryptoJS.AES.decrypt({ ciphertext }, key, {
        iv,
        mode: modeMap[scheme],
        padding: CryptoJS.pad.Pkcs7,
      });
      return bytes.toString(CryptoJS.enc.Utf8) || null;
    } catch (err) {
      return null;
    }
  };

  const structured = tryStructured(cipher);
  if (structured) return structured;

  try {
    const { key, iv } = deriveEncryptionParams(pass);
    const bytes = CryptoJS.AES.decrypt(cipher, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
    return bytes.toString(CryptoJS.enc.Utf8) || null;
  } catch (err) {
    return null;
  }
};

const ensureEncryptedMessage = (message) => {
  if (!message || typeof message !== 'object') return message;
  if (message.type !== 'text') return message;
  const copy = { ...message };
  if (!copy.encrypted && typeof copy.msg === 'string') {
    copy.msg = encryptText(copy.msg);
    copy.encrypted = true;
  }
  return copy;
};

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(globalMessagesDir)) {
  fs.mkdirSync(globalMessagesDir, { recursive: true });
}

if (!fs.existsSync(chatsDir)) {
  fs.mkdirSync(chatsDir, { recursive: true });
}

if (!fs.existsSync(groupsDir)) {
  fs.mkdirSync(groupsDir, { recursive: true });
}

// Global message storage - all messages stored in one place
const getMessagePath = (id) => path.join(globalMessagesDir, `${id}.json`);

const saveMessageToFile = (message) => {
  const filePath = getMessagePath(message.id);
  fs.writeFileSync(filePath, JSON.stringify(message, null, 2), 'utf8');
};

const loadStoredMessages = () => {
  if (!fs.existsSync(globalMessagesDir)) return [];
  return fs.readdirSync(globalMessagesDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(globalMessagesDir, file), 'utf8'));
      } catch (err) {
        console.error('Не удалось прочитать файл сообщения', file, err);
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
};

// --- Chat/Group system ---
const chatsFilePath = path.join(chatsDir, 'chats.json');
const groupsFilePath = path.join(groupsDir, 'groups.json');

const loadChats = () => {
  if (!fs.existsSync(chatsFilePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(chatsFilePath, 'utf8'));
  } catch (e) {
    return {};
  }
};

const saveChats = (chats) => {
  fs.writeFileSync(chatsFilePath, JSON.stringify(chats, null, 2), 'utf8');
};

const loadGroups = () => {
  if (!fs.existsSync(groupsFilePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(groupsFilePath, 'utf8'));
  } catch (e) {
    return {};
  }
};

const saveGroups = (groups) => {
  fs.writeFileSync(groupsFilePath, JSON.stringify(groups, null, 2), 'utf8');
};

// Per-chat message storage
const getChatMessagePath = (chatId, msgId) => path.join(chatsDir, `${chatId}_${msgId}.json`);
const getGroupMessagePath = (groupId, msgId) => path.join(groupsDir, `${groupId}_${msgId}.json`);

const saveChatMessageToFile = (chatId, message) => {
  const filePath = getChatMessagePath(chatId, message.id);
  fs.writeFileSync(filePath, JSON.stringify(message, null, 2), 'utf8');
};

const saveGroupMessageToFile = (groupId, message) => {
  const filePath = getGroupMessagePath(groupId, message.id);
  fs.writeFileSync(filePath, JSON.stringify(message, null, 2), 'utf8');
};

const loadChatMessages = (chatId) => {
  if (!fs.existsSync(chatsDir)) return [];
  return fs.readdirSync(chatsDir)
    .filter((file) => file.startsWith(chatId + '_') && file.endsWith('.json'))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(chatsDir, file), 'utf8'));
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
};

const loadGroupMessages = (groupId) => {
  if (!fs.existsSync(groupsDir)) return [];
  return fs.readdirSync(groupsDir)
    .filter((file) => file.startsWith(groupId + '_') && file.endsWith('.json'))
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(groupsDir, file), 'utf8'));
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
};

const deleteChatMessageFile = (chatId, msgId) => {
  const filePath = getChatMessagePath(chatId, msgId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
};

const deleteGroupMessageFile = (groupId, msgId) => {
  const filePath = getGroupMessagePath(groupId, msgId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
};

const deleteMessageFile = (id) => {
  const filePath = getMessagePath(id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
};

const deleteAllMessages = () => {
  if (!fs.existsSync(globalMessagesDir)) return 0;
  const files = fs.readdirSync(globalMessagesDir).filter((file) => file.endsWith('.json'));
  files.forEach((file) => {
    const filePath = path.join(globalMessagesDir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
  return files.length;
};

app.use('/uploads', express.static(uploadsDir));
app.use(express.json());

const authStore = new AuthStore({ rootDir: path.join(__dirname, 'auth') });

const getSessionToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '').trim();
  }
  return req.headers['x-session-token'] || req.query.token || req.body?.token || '';
};

const requireAuth = (req, res, next) => {
  const token = getSessionToken(req);
  const result = authStore.validateSession(token);
  if (!result) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.auth = result;
  next();
};

// Serve login page at root so users see it first
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/login.html'));
});

app.use('/', express.static(path.join(__dirname, '../client')));

// Создаем HTTP и socket.io серверы (чтобы маршруты могли использовать `io` сразу)
const server = createServer(app);
const io  = new Server(server);

app.post('/auth/request-code', express.json(), async (req, res) => {
  try {
    const rawLogin = String(req.body?.login || '').trim();
    const rawNotify = String(req.body?.notifyEmail || '').trim();
    const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

    if (!rawLogin || !isEmail(rawLogin)) {
      return res.status(400).json({ error: 'Для отправки кода укажите корректный email.' });
    }

    if (rawNotify && !isEmail(rawNotify)) {
      return res.status(400).json({ error: 'Дополнительный адрес должен быть корректным email.' });
    }

    const smtpHost = process.env.SMTP_HOST || process.env.MAIL_HOST || '';
    const smtpPort = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 0);
    const smtpUser = process.env.SMTP_USER || process.env.MAIL_USER || '';
    const smtpPass = process.env.SMTP_PASS || process.env.MAIL_PASS || '';
    const showCode = process.env.SHOW_CODE === '1';

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return res.status(503).json({ error: 'Отправка email не настроена. Обратитесь к администратору.' });
    }

    const payload = authStore.requestCode({
      login: rawLogin,
      purpose: req.body?.purpose || 'register',
      name: req.body?.name,
      password: req.body?.password,
    });

    const requestedNotify = rawNotify ? rawNotify.split(/[;,\s]+/).filter(Boolean)[0] : '';
    const recipient = requestedNotify || rawLogin;

    if (!recipient || !isEmail(recipient)) {
      authStore.clearCode(rawLogin);
      return res.status(400).json({ error: 'Укажите корректный email для получения кода.' });
    }

    const safeRecipient = String(recipient).split(/[;,\s]+/)[0];
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    try {
      await transporter.sendMail({
        from: process.env.MAIL_FROM || smtpUser,
        to: safeRecipient,
        subject: 'Код подтверждения',
        html: `<div style="font-family: sans-serif; color: #111;"><h3>Ваш код подтверждения</h3><p style="font-size:18px;font-weight:700;color:#b22222">${payload.code}</p></div>`,
      });
      if (!showCode) delete payload.code;
      payload.sentToEmail = true;
      payload.sentTo = safeRecipient;
      return res.json(payload);
    } catch (error) {
      console.error('Failed to send confirmation email', error);
      authStore.clearCode(rawLogin);
      return res.status(502).json({ error: 'Не удалось отправить письмо. Проверьте настройки почты и попробуйте снова.' });
    }
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to request code' });
  }
});

app.post('/auth/register', express.json(), (req, res) => {
  try {
    const result = authStore.register({
      name: req.body?.name,
      login: req.body?.login,
      password: req.body?.password,
      code: req.body?.code,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Registration failed' });
  }
});

app.post('/auth/login', express.json(), (req, res) => {
  try {
    const result = authStore.login({
      login: req.body?.login,
      password: req.body?.password,
    });
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message || 'Login failed' });
  }
});

app.post('/auth/reset-password', express.json(), (req, res) => {
  try {
    const result = authStore.resetPassword({
      login: req.body?.login,
      code: req.body?.code,
      newPassword: req.body?.newPassword,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Password reset failed' });
  }
});

app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: authStore.publicUser(req.auth.user), session: req.auth.session });
});

app.get('/users/search', requireAuth, (req, res) => {
  const query = String(req.query.q || '');
  res.json(authStore.searchUsers({ query, currentUserId: req.auth.user.id }));
});

app.post('/users/add-contact', requireAuth, express.json(), (req, res) => {
  try {
    const result = authStore.addContact({
      userId: req.auth.user.id,
      contactId: req.body?.contactId,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Contact add failed' });
  }
});

app.delete('/users/contacts/:contactId', requireAuth, (req, res) => {
  try {
    const result = authStore.removeContact({
      userId: req.auth.user.id,
      contactId: req.params.contactId,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Contact remove failed' });
  }
});

app.post('/users/add-contact-by-reference', requireAuth, express.json(), (req, res) => {
  try {
    const result = authStore.addContactByReference({
      userId: req.auth.user.id,
      identifier: req.body?.identifier,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Contact add failed' });
  }
});

app.get('/users/me', requireAuth, (req, res) => {
  res.json({ user: authStore.publicUser(req.auth.user) });
});

app.put('/users/me', requireAuth, express.json(), (req, res) => {
  try {
    const result = authStore.updateProfile({
      userId: req.auth.user.id,
      name: req.body?.name,
      bio: req.body?.bio,
      status: req.body?.status,
      avatar: req.body?.avatar,
      phone: req.body?.phone,
    });
    io.emit('user updated', result.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Profile update failed' });
  }
});

app.post('/users/sync-phone-contacts', requireAuth, express.json(), (req, res) => {
  try {
    const result = authStore.syncPhoneContacts({
      userId: req.auth.user.id,
      contacts: Array.isArray(req.body?.contacts) ? req.body.contacts : [],
    });
    io.emit('phone contacts synced', result.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Phone sync failed' });
  }
});

app.get('/messages', (req, res) => {
  res.json(loadStoredMessages());
});

// Provide the shared encryption key via HTTP for clients that may miss the socket event
app.get('/encryption-key', (req, res) => {
  try {
    res.json({ key: GLOBAL_ENCRYPTION_KEY });
  } catch (err) {
    res.status(500).json({ error: 'Unable to provide encryption key' });
  }
});

app.delete('/messages', (req, res) => {
  try {
    const deletedCount = deleteAllMessages();
    io.emit('messages cleared');
    res.json({ success: true, deleted: deletedCount });
  } catch (err) {
    console.error('Не удалось удалить все сообщения', err);
    res.status(500).json({ error: 'Не удалось удалить все сообщения' });
  }
});

app.delete('/messages/:id', (req, res) => {
  const { id } = req.params;
  if (!deleteMessageFile(id)) {
    return res.status(404).json({ error: 'Сообщение не найдено' });
  }
  io.emit('message deleted', { id });
  res.json({ success: true });
});

app.post('/upload', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
  const rawName = req.header('x-filename') || 'file';
  const name = decodeURIComponent(rawName);
  const safeName = path.basename(name);
  const fileType = req.header('content-type') || 'application/octet-stream';
  const savedName = `${Date.now()}-${safeName}`;
  const targetPath = path.join(uploadsDir, savedName);

  fs.writeFile(targetPath, req.body, (err) => {
    if (err) {
      console.error('Upload failed:', err);
      return res.status(500).json({ error: 'Не удалось сохранить файл' });
    }
    res.json({ url: `/uploads/${savedName}`, name: safeName, type: fileType });
  });
});

app.get('/download-project', (req, res) => {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="synapse-project.zip"');

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Archive error', err);
    if (!res.headersSent) {
      res.status(500).send('Не удалось создать архив');
    }
  });
  archive.pipe(res);

  archive.glob('**/*', {
    cwd: path.join(__dirname, '..'),
    ignore: [
      'node_modules/**',
      '.git/**',
      'server/contacts/**',
      'package-lock.json',
      'npm-debug.log',
      'yarn.lock'
    ]
  });
  archive.finalize();
});

// View server logs
app.get('/logs', (req, res) => {
  try {
    if (!fs.existsSync(logsFile)) {
      return res.json({ logs: [], message: 'No logs yet' });
    }
    const logs = fs.readFileSync(logsFile, 'utf8').split('\n').filter(Boolean);
    const tail = req.query.tail ? parseInt(req.query.tail, 10) : 100;
    const tailedLogs = logs.slice(Math.max(0, logs.length - tail));
    res.json({ logs: tailedLogs, total: logs.length });
  } catch (err) {
    console.error('Failed to read logs', err);
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// Avatar storage: userId -> avatarUrl
const userAvatarsDir = path.join(__dirname, 'avatars');
if (!fs.existsSync(userAvatarsDir)) {
  fs.mkdirSync(userAvatarsDir, { recursive: true });
}

// In-memory map of userId -> avatar URL (persisted to disk as JSON)
const avatarMapFile = path.join(userAvatarsDir, '_map.json');
let avatarMap = {};
if (fs.existsSync(avatarMapFile)) {
  try {
    avatarMap = JSON.parse(fs.readFileSync(avatarMapFile, 'utf8'));
  } catch (e) {
    avatarMap = {};
  }
}

const saveAvatarMap = () => {
  fs.writeFileSync(avatarMapFile, JSON.stringify(avatarMap, null, 2), 'utf8');
};

// --- Chat/Group HTTP routes ---
app.get('/chats', (req, res) => {
  res.json(loadChats());
});

app.post('/chats/create', express.json(), (req, res) => {
  const { targetUserId, targetUserName } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'Missing targetUserId' });
  const chats = loadChats();
  const chatId = [req.body.myUserId, targetUserId].sort().join('_');
  if (!chats[chatId]) {
    chats[chatId] = {
      id: chatId,
      type: 'private',
      participants: [req.body.myUserId, targetUserId],
      name: targetUserName || targetUserId,
      createdAt: Date.now(),
    };
    saveChats(chats);
  }
  res.json({ chat: chats[chatId] });
});

app.get('/chats/:chatId/messages', (req, res) => {
  res.json(loadChatMessages(req.params.chatId));
});

app.get('/groups', (req, res) => {
  res.json(loadGroups());
});

app.post('/groups/create', express.json(), (req, res) => {
  const { name, creatorId, members } = req.body;
  if (!name || !creatorId) return res.status(400).json({ error: 'Missing name or creatorId' });
  const groups = loadGroups();
  const groupId = `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  groups[groupId] = {
    id: groupId,
    type: 'group',
    name,
    creator: creatorId,
    members: members || [creatorId],
    createdAt: Date.now(),
  };
  saveGroups(groups);
  io.emit('group created', groups[groupId]);
  res.json({ group: groups[groupId] });
});

app.post('/groups/:groupId/join', express.json(), (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });
  const groups = loadGroups();
  const group = groups[req.params.groupId];
  if (!group) return res.status(404).json({ error: 'Group not found' });
  if (!group.members.includes(userId)) {
    group.members.push(userId);
    saveGroups(groups);
    io.emit('group updated', group);
  }
  res.json({ group });
});

app.get('/groups/:groupId/messages', (req, res) => {
  res.json(loadGroupMessages(req.params.groupId));
});

app.use('/avatars', express.static(userAvatarsDir));

// Extend avatar upload to accept data URL (from camera)
app.post('/upload-avatar', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const userId = req.header('x-user-id');
  if (!userId) {
    return res.status(400).json({ error: 'Missing x-user-id header' });
  }
  let buffer = req.body;
  let ext = 'jpg';
  let contentType = req.header('content-type');
  
  // Handle data URL
  if (contentType && contentType.startsWith('text/')) {
    const dataUrl = buffer.toString('utf8');
    const matches = dataUrl.match(/^data:image\/([a-z]+);base64,/);
    if (matches) {
      ext = matches[1] === 'png' ? 'png' : 'jpg';
      const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    }
  } else {
    ext = contentType === 'image/png' ? 'png' : 'jpg';
  }
  
  const safeName = `${userId.replace(/[^a-zA-Z0-9_-]/g, '')}.${ext}`;
  const targetPath = path.join(userAvatarsDir, safeName);
  fs.writeFile(targetPath, buffer, (err) => {
    if (err) {
      console.error('Avatar upload failed:', err);
      return res.status(500).json({ error: 'Failed to save avatar' });
    }
    const url = `/avatars/${safeName}?t=${Date.now()}`;
    avatarMap[userId] = url;
    saveAvatarMap();
    io.emit('avatar updated', { userId, url });
    res.json({ url });
  });
});

app.post('/upload-avatar', express.raw({ type: 'image/*', limit: '5mb' }), (req, res) => {
  const userId = req.header('x-user-id');
  if (!userId) {
    return res.status(400).json({ error: 'Missing x-user-id header' });
  }
  const ext = req.header('content-type') === 'image/png' ? 'png' : 'jpg';
  const safeName = `${userId.replace(/[^a-zA-Z0-9_-]/g, '')}.${ext}`;
  const targetPath = path.join(userAvatarsDir, safeName);
  fs.writeFile(targetPath, req.body, (err) => {
    if (err) {
      console.error('Avatar upload failed:', err);
      return res.status(500).json({ error: 'Failed to save avatar' });
    }
    const url = `/avatars/${safeName}?t=${Date.now()}`;
    avatarMap[userId] = url;
    saveAvatarMap();
    // Notify all clients about the avatar update
    io.emit('avatar updated', { userId, url });
    res.json({ url });
  });
});

// Track connected users
const connectedUsers = new Map(); // userId -> { name, socketId, userAgent }

io.on('connection', (socket) => {
  // Determine userId from socket auth (preferred) or query (fallback)
  const userId = (socket.handshake && (socket.handshake.auth && socket.handshake.auth.userId))
    || (socket.handshake && socket.handshake.query && socket.handshake.query.userId)
    || 'public';

  socket.userId = String(userId);
  console.log(`🔵 ${socket.id} connected as user '${socket.userId}'`);

  // Send shared encryption key to the connecting client first
  socket.emit('encryption key', GLOBAL_ENCRYPTION_KEY);

  // Send stored messages to the connecting user
  socket.emit('stored messages', loadStoredMessages());

  // Send avatar map to the connecting client
  socket.emit('avatar map', avatarMap);

  // Listen for user info to store name
  socket.on('user info', (data) => {
    connectedUsers.set(socket.userId, {
      name: data.name || 'Unknown',
      socketId: socket.id,
      userId: socket.userId,
      timestamp: Date.now()
    });
    // Broadcast updated user list to all
    io.emit('users list', Array.from(connectedUsers.values()));
    console.log(`📝 User ${socket.userId} info updated:`, data.name);
  });

  // Send current users list to new connection
  socket.emit('users list', Array.from(connectedUsers.values()));

  socket.on('disconnect', () => {
    connectedUsers.delete(socket.userId);
    io.emit('users list', Array.from(connectedUsers.values()));
    console.log(`🔴 ${socket.id} disconnected`);
  });

  socket.on('chat message', async (data) => {
    const message = ensureEncryptedMessage({
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'text',
      timestamp: Date.now(),
      userId: socket.userId,
    });
    saveMessageToFile(message);
    io.emit('chat message', message);

    try {
      const telegramText = formatTelegramChatMessage(message);
      await sendTelegramMessage(telegramText, { html: true });
    } catch (err) {
      console.error('Telegram send failed for chat message', err);
    }
  });

  socket.on('voice message', (payload) => {
    const message = {
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'voice',
      timestamp: Date.now(),
      userId: socket.userId,
    };
    saveMessageToFile(message);
    io.emit('voice message', message);
  });

  socket.on('file message', (payload) => {
    const message = {
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'file',
      timestamp: Date.now(),
      userId: socket.userId,
    };
    saveMessageToFile(message);
    io.emit('file message', message);
  });

  // Chat/group message handlers
  socket.on('chat message private', async (data) => {
    const { chatId } = data;
    if (!chatId) return;
    const message = ensureEncryptedMessage({
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'text',
      timestamp: Date.now(),
      userId: socket.userId,
    });
    saveChatMessageToFile(chatId, message);
    // Send to all connected participants
    const chats = loadChats();
    const chat = chats[chatId];
    if (chat && chat.participants) {
      chat.participants.forEach((pid) => {
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === pid);
        if (targetSocket) {
          targetSocket.emit('chat message private', message);
        }
      });
    }
  });

  socket.on('voice message private', (payload) => {
    const { chatId } = payload;
    if (!chatId) return;
    const message = {
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'voice',
      timestamp: Date.now(),
      userId: socket.userId,
    };
    saveChatMessageToFile(chatId, message);
    const chats = loadChats();
    const chat = chats[chatId];
    if (chat && chat.participants) {
      chat.participants.forEach((pid) => {
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === pid);
        if (targetSocket) {
          targetSocket.emit('voice message private', message);
        }
      });
    }
  });

  socket.on('file message private', (payload) => {
    const { chatId } = payload;
    if (!chatId) return;
    const message = {
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'file',
      timestamp: Date.now(),
      userId: socket.userId,
    };
    saveChatMessageToFile(chatId, message);
    const chats = loadChats();
    const chat = chats[chatId];
    if (chat && chat.participants) {
      chat.participants.forEach((pid) => {
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === pid);
        if (targetSocket) {
          targetSocket.emit('file message private', message);
        }
      });
    }
  });

  // Group message handlers
  socket.on('group message', async (data) => {
    const { groupId } = data;
    if (!groupId) return;
    const message = ensureEncryptedMessage({
      ...data,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'text',
      timestamp: Date.now(),
      userId: socket.userId,
    });
    saveGroupMessageToFile(groupId, message);
    const groups = loadGroups();
    const group = groups[groupId];
    if (group && group.members) {
      group.members.forEach((memberId) => {
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === memberId);
        if (targetSocket) {
          targetSocket.emit('group message', message);
        }
      });
    }
  });

  socket.on('voice message group', (payload) => {
    const { groupId } = payload;
    if (!groupId) return;
    const message = {
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'voice',
      timestamp: Date.now(),
      userId: socket.userId,
    };
    saveGroupMessageToFile(groupId, message);
    const groups = loadGroups();
    const group = groups[groupId];
    if (group && group.members) {
      group.members.forEach((memberId) => {
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === memberId);
        if (targetSocket) {
          targetSocket.emit('voice message group', message);
        }
      });
    }
  });

  socket.on('file message group', (payload) => {
    const { groupId } = payload;
    if (!groupId) return;
    const message = {
      ...payload,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'file',
      timestamp: Date.now(),
      userId: socket.userId,
    };
    saveGroupMessageToFile(groupId, message);
    const groups = loadGroups();
    const group = groups[groupId];
    if (group && group.members) {
      group.members.forEach((memberId) => {
        const targetSocket = [...io.sockets.sockets.values()].find(s => s.userId === memberId);
        if (targetSocket) {
          targetSocket.emit('file message group', message);
        }
      });
    }
  });

});

server.listen(port, () => {
  console.log(`Server is running on port ${port}!`);
  console.log(`🌐 http://localhost:${port}`);
});

