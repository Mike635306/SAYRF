const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class AuthStore {
  constructor({ rootDir = path.join(__dirname, 'auth') } = {}) {
    this.rootDir = rootDir;
    this.usersFile = path.join(this.rootDir, 'users.json');
    this.sessionsFile = path.join(this.rootDir, 'sessions.json');
    this.codesFile = path.join(this.rootDir, 'codes.json');
    this.users = {};
    this.sessions = {};
    this.codes = {};

    this.ensureStorage();
    this.load();
  }

  ensureStorage() {
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  readJson(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      const raw = fs.readFileSync(filePath, 'utf8');
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  }

  load() {
    this.users = this.readJson(this.usersFile, {});
    this.sessions = this.readJson(this.sessionsFile, {});
    this.codes = this.readJson(this.codesFile, {});
    this.pruneExpiredCodes();
    this.pruneExpiredSessions();
  }

  saveUsers() {
    this.writeJson(this.usersFile, this.users);
  }

  saveSessions() {
    this.writeJson(this.sessionsFile, this.sessions);
  }

  saveCodes() {
    this.writeJson(this.codesFile, this.codes);
  }

  clearCode(login) {
    const normalizedLogin = this.normalizeLogin(login);
    if (!normalizedLogin || !this.codes[normalizedLogin]) return;
    delete this.codes[normalizedLogin];
    this.saveCodes();
  }

  normalizeLogin(login) {
    return String(login || '').trim().toLowerCase();
  }

  hashPassword(password) {
    return crypto.createHash('sha256').update(String(password || '')).digest('hex');
  }

  generateCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  generateUserId() {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  generateToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  findUserByLogin(login) {
    const normalized = this.normalizeLogin(login);
    if (!normalized) return null;
    return Object.values(this.users).find((user) => this.normalizeLogin(user.login) === normalized) || null;
  }

  getUserById(userId) {
    return this.users[userId] || null;
  }

  formatUserStatus(user) {
    if (!user) return 'offline';
    if (user.status === 'away') return 'away';
    if (user.status === 'offline') return 'offline';
    return 'online';
  }

  publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      login: user.login,
      avatar: user.avatar || '',
      status: this.formatUserStatus(user),
      lastSeen: user.lastSeen || Date.now(),
      contacts: Array.isArray(user.contacts) ? user.contacts : [],
      bio: user.bio || '',
      createdAt: user.createdAt,
      phone: user.phone || '',
    };
  }

  pruneExpiredCodes() {
    const now = Date.now();
    for (const key of Object.keys(this.codes)) {
      const codeEntry = this.codes[key];
      if (!codeEntry || !codeEntry.expiresAt || Number(codeEntry.expiresAt) <= now) {
        delete this.codes[key];
      }
    }
    this.saveCodes();
  }

  pruneExpiredSessions() {
    const now = Date.now();
    for (const token of Object.keys(this.sessions)) {
      const session = this.sessions[token];
      if (!session || Number(session.expiresAt) <= now) {
        delete this.sessions[token];
      }
    }
    this.saveSessions();
  }

  requestCode({ login, purpose = 'register', name = '', password = '' }) {
    const normalizedLogin = this.normalizeLogin(login);
    if (!normalizedLogin) {
      throw new Error('Логин обязателен');
    }

    if (purpose === 'register' && this.findUserByLogin(normalizedLogin)) {
      throw new Error('Пользователь с таким логином уже зарегистрирован');
    }

    if (purpose === 'reset' && !this.findUserByLogin(normalizedLogin)) {
      throw new Error('Аккаунт не найден');
    }

    const code = this.generateCode();
    this.codes[normalizedLogin] = {
      login: normalizedLogin,
      purpose,
      name: String(name || '').trim(),
      passwordHash: password ? this.hashPassword(password) : null,
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    this.saveCodes();

    return {
      ok: true,
      login: normalizedLogin,
      code,
      expiresInMs: 5 * 60 * 1000,
      purpose,
    };
  }

  validateCode({ login, code, purpose }) {
    const normalizedLogin = this.normalizeLogin(login);
    const codeEntry = this.codes[normalizedLogin];
    if (!codeEntry) {
      throw new Error('Код подтверждения не найден');
    }
    if (codeEntry.purpose !== purpose) {
      throw new Error('Неверный тип кода');
    }
    if (Number(codeEntry.expiresAt) < Date.now()) {
      delete this.codes[normalizedLogin];
      this.saveCodes();
      throw new Error('Код подтверждения истёк');
    }
    if (String(codeEntry.code) !== String(code)) {
      throw new Error('Неверный код подтверждения');
    }
    return codeEntry;
  }

  createSession(user) {
    const token = this.generateToken();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    this.sessions[token] = {
      token,
      userId: user.id,
      expiresAt,
      createdAt: Date.now(),
    };
    this.saveSessions();
    return { token, expiresAt };
  }

  validateSession(token) {
    const session = this.sessions[token];
    if (!session) {
      return null;
    }
    if (Number(session.expiresAt) <= Date.now()) {
      delete this.sessions[token];
      this.saveSessions();
      return null;
    }
    const user = this.getUserById(session.userId);
    if (!user) {
      delete this.sessions[token];
      this.saveSessions();
      return null;
    }
    return { user, session };
  }

  register({ name, login, password, code }) {
    const normalizedLogin = this.normalizeLogin(login);
    if (!normalizedLogin) {
      throw new Error('Логин обязателен');
    }
    if (!password || String(password).trim().length < 8) {
      throw new Error('Пароль должен содержать минимум 8 символов');
    }
    const validCode = this.validateCode({ login: normalizedLogin, code, purpose: 'register' });
    if (this.findUserByLogin(normalizedLogin)) {
      throw new Error('Пользователь уже существует');
    }

    const userId = this.generateUserId();
    const user = {
      id: userId,
      name: String(name || validCode.name || 'Пользователь').trim() || 'Пользователь',
      login: normalizedLogin,
      passwordHash: this.hashPassword(password),
      avatar: '',
      status: 'online',
      lastSeen: Date.now(),
      contacts: [],
      bio: '',
      createdAt: Date.now(),
    };

    this.users[userId] = user;
    delete this.codes[normalizedLogin];
    this.saveUsers();
    this.saveCodes();

    const session = this.createSession(user);
    return {
      ok: true,
      user: this.publicUser(user),
      session,
    };
  }

  login({ login, password }) {
    const normalizedLogin = this.normalizeLogin(login);
    const user = this.findUserByLogin(normalizedLogin);
    if (!user) {
      throw new Error('Неверный логин или пароль');
    }
    if (user.passwordHash !== this.hashPassword(password)) {
      throw new Error('Неверный логин или пароль');
    }
    user.status = 'online';
    user.lastSeen = Date.now();
    this.saveUsers();

    const session = this.createSession(user);
    return {
      ok: true,
      user: this.publicUser(user),
      session,
    };
  }

  resetPassword({ login, code, newPassword }) {
    const normalizedLogin = this.normalizeLogin(login);
    if (!normalizedLogin) {
      throw new Error('Логин обязателен');
    }
    if (!newPassword || String(newPassword).trim().length < 8) {
      throw new Error('Пароль должен содержать минимум 8 символов');
    }

    const validCode = this.validateCode({ login: normalizedLogin, code, purpose: 'reset' });
    const user = this.findUserByLogin(normalizedLogin);
    if (!user) {
      throw new Error('Аккаунт не найден');
    }

    user.passwordHash = this.hashPassword(newPassword);
    user.lastSeen = Date.now();
    delete this.codes[normalizedLogin];
    this.saveUsers();
    this.saveCodes();

    return {
      ok: true,
      user: this.publicUser(user),
    };
  }

  searchUsers({ query, currentUserId = null, limit = 20 }) {
    const needle = String(query || '').trim().toLowerCase();
    const list = Object.values(this.users);
    const filtered = list.filter((user) => {
      if (currentUserId && user.id === currentUserId) return false;
      if (!needle) return true;
      return (
        user.name.toLowerCase().includes(needle)
        || user.login.toLowerCase().includes(needle)
        || user.id.toLowerCase().includes(needle)
      );
    });

    return filtered
      .slice(0, limit)
      .map((user) => this.publicUser(user));
  }

  addContact({ userId, contactId }) {
    const user = this.getUserById(userId);
    const contact = this.getUserById(contactId);
    if (!user || !contact) {
      throw new Error('Пользователь не найден');
    }
    if (userId === contactId) {
      throw new Error('Нельзя добавить самого себя');
    }
    if (!Array.isArray(user.contacts)) {
      user.contacts = [];
    }
    if (!user.contacts.includes(contactId)) {
      user.contacts.push(contactId);
      this.saveUsers();
    }
    return {
      ok: true,
      contacts: user.contacts,
      contact: this.publicUser(contact),
    };
  }

  removeContact({ userId, contactId }) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    const original = Array.isArray(user.contacts) ? user.contacts : [];
    const nextContacts = original.filter((entry) => {
      const entryId = typeof entry === 'string' ? entry : entry?.id || entry?.userId;
      return entryId !== contactId;
    });

    user.contacts = nextContacts;
    this.saveUsers();

    return {
      ok: true,
      contacts: user.contacts,
    };
  }

  addContactByReference({ userId, identifier }) {
    const value = String(identifier || '').trim();
    if (!value) {
      throw new Error('ID или номер контакта обязательны');
    }

    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    let contact = this.getUserById(value);
    if (!contact) {
      contact = Object.values(this.users).find((person) => {
        const phone = String(person.phone || '').trim();
        return phone && phone.replace(/\D/g, '') === value.replace(/\D/g, '');
      }) || null;
    }

    if (!contact) {
      throw new Error('Пользователь с таким ID или номером не найден');
    }

    if (user.id === contact.id) {
      throw new Error('Нельзя добавить самого себя');
    }

    const existing = Array.isArray(user.contacts) ? user.contacts : [];
    const alreadyExists = existing.some((entry) => {
      const entryId = typeof entry === 'string' ? entry : entry?.id || entry?.userId;
      return entryId === contact.id;
    });

    if (!alreadyExists) {
      user.contacts.push({
        id: contact.id,
        name: contact.name,
        phone: contact.phone || '',
        status: contact.status || 'online',
      });
      this.saveUsers();
    }

    return {
      ok: true,
      contacts: user.contacts,
      contact: this.publicUser(contact),
    };
  }

  updateProfile({ userId, name, bio, status, avatar, phone }) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    if (typeof name === 'string' && name.trim()) {
      user.name = name.trim();
    }
    if (typeof bio === 'string') {
      user.bio = bio.trim().slice(0, 250);
    }
    if (typeof status === 'string') {
      user.status = ['online', 'offline', 'away'].includes(status) ? status : 'online';
    }
    if (typeof avatar === 'string' && avatar.trim()) {
      user.avatar = avatar.trim();
    }
    if (typeof phone === 'string') {
      user.phone = phone.trim();
    }
    user.lastSeen = Date.now();
    this.saveUsers();

    return {
      ok: true,
      user: this.publicUser(user),
    };
  }

  syncPhoneContacts({ userId, contacts = [] }) {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    const normalizedContacts = Array.isArray(contacts) ? contacts : [];
    const existing = new Map();

    for (const contact of normalizedContacts) {
      if (!contact || typeof contact !== 'object') continue;
      const name = String(contact.name || 'Контакт').trim();
      const phone = String(contact.phone || contact.number || '').trim();
      if (!phone) continue;
      existing.set(phone, { name, phone });
    }

    const imported = Array.from(existing.values());
    user.contacts = imported.map((item) => ({
      id: `phone-${item.phone.replace(/\D/g, '')}`,
      name: item.name,
      phone: item.phone,
    }));
    user.lastSeen = Date.now();
    this.saveUsers();

    return {
      ok: true,
      imported,
      user: this.publicUser(user),
    };
  }
}

module.exports = { AuthStore };
