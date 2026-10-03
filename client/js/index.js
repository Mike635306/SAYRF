const msgBox = document.querySelector('#chat-msg-dialog');
const msgInput = document.querySelector('#message-input');
const sendMsgBtn = document.querySelector('#send-msg');
const mobileMenuBtn = document.querySelector('#mobile_menu');
const audioMsgBtn = document.querySelector('#audio-msg');
const sendAudioMsgbtn = document.querySelector('#audio-msg-notif');
const openModalBtn = document.getElementById('openBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const deleteAllBtn = document.querySelector('#delete-all-fixed');
const modal = document.getElementById('modal');
const modalOverlay = document.getElementById('modalOverlay');
const modalFileInput = document.getElementById('modalFileInput');
const modalSendFileBtn = document.getElementById('modalSendFileBtn');
const modalFileLabel = document.getElementById('modalFileLabel');
const modalUploadProgressWrapper = document.getElementById('modalUploadProgressWrapper');
const modalUploadProgress = document.getElementById('modalUploadProgress');
const modalUploadProgressText = document.getElementById('modalUploadProgressText');
const settingsModal = document.querySelector('#dialog-overlay-backdrop');
const openSettingsBtns = document.querySelectorAll('.open-settings-btn');
const closeSettingsBtn = document.querySelector('#close-dialog-btn');

// Открыть окно настроек
function openSettingsModal() {
    if (settingsModal) {
        settingsModal.style.display = 'flex';
    }
}

// Закрыть окно настроек
function closeSettingsModal() {
    if (settingsModal) {
        settingsModal.style.display = 'none';
    }
}

// Обработчики для кнопок настроек
if (openSettingsBtns && openSettingsBtns.length) {
    openSettingsBtns.forEach((button) => button.addEventListener('click', openSettingsModal));
}
if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', closeSettingsModal);
}
// Закрытие по клику на фон (overlay)
if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });
}
        
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const openModal = () => {
  modal.classList.remove('hidden');
};

const closeModal = () => {
  modal.classList.add('hidden');
  modalFileInput.value = '';
  modalFileLabel.textContent = '';
  modalSendFileBtn.disabled = true;
  modalUploadProgressWrapper.classList.add('hidden');
  modalUploadProgress.value = 0;
  modalUploadProgressText.textContent = '0%';
};

const setUploadProgress = (percent) => {
  modalUploadProgressWrapper.classList.remove('hidden');
  modalUploadProgress.value = percent;
  modalUploadProgressText.textContent = `${percent}%`;
};

let audioChunks = [];
let isAudioRecording = false;
let mediaRecording;

const isMobileScreen = () => window.matchMedia('(max-width: 600px)').matches;
const mobileOverlay = document.querySelector('.right-bar-overlay');

const showMobileContacts = () => {
  if (!isMobileScreen() || !mobileOverlay) return;
  mobileOverlay.classList.add('active');
  document.body.classList.add('mobile-contacts-open');
  document.body.classList.remove('mobile-chat-open');
};

const hideMobileContacts = () => {
  if (!isMobileScreen() || !mobileOverlay) return;
  mobileOverlay.classList.remove('active');
  document.body.classList.remove('mobile-contacts-open');
  document.body.classList.add('mobile-chat-open');
};

const updateMobileState = () => {
  if (isMobileScreen()) {
    showMobileContacts();
  } else {
    if (mobileOverlay) mobileOverlay.classList.remove('active');
    document.body.classList.remove('mobile-contacts-open', 'mobile-chat-open');
  }
};

mobileMenuBtn.addEventListener('click', showMobileContacts);
window.addEventListener('resize', updateMobileState);
updateMobileState();

const setupMobileContactClicks = () => {
  const desktopContacts = document.querySelector('#contacts ul');
  const mobileContacts = document.querySelector('#lifg');
  const handleClick = (e) => {
    const item = e.target.closest('li.rogc');
    if (!item || item.id === 'openModalBtn') return;
    if (!isMobileScreen()) return;
    hideMobileContacts();
  };
  desktopContacts?.addEventListener('click', handleClick);
  mobileContacts?.addEventListener('click', handleClick);
};

setupMobileContactClicks();

const DEFAULT_ENCRYPTION_KEY = 'EyeCode University';
const sessionToken = localStorage.getItem('synapse_session_token');
let user = localStorage.getItem('synapse_user_name') || 'User';
let userId = localStorage.getItem('synapse_user_id') || '';

async function ensureAuthenticatedSession() {
  if (!sessionToken) {
    window.location.replace('/login.html');
    return null;
  }

  try {
    const response = await fetch('/auth/me', {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
    });
    if (!response.ok) {
      throw new Error('Session expired');
    }
    const data = await response.json();
    if (data && data.user) {
      user = data.user.name || data.user.login || user;
      userId = data.user.id || userId;
      localStorage.setItem('synapse_user_name', user);
      localStorage.setItem('synapse_user_id', userId);
      localStorage.setItem('synapse_user_login', data.user.login || '');
    }
    return data?.user || null;
  } catch (error) {
    localStorage.removeItem('synapse_session_token');
    localStorage.removeItem('synapse_user_id');
    localStorage.removeItem('synapse_user_name');
    window.location.replace('/login.html');
    return null;
  }
}

// Use a single shared encryption key for all clients
let encryptionKey = DEFAULT_ENCRYPTION_KEY;

const selfContactLabel = document.querySelector('#openModalBtn span');
if (selfContactLabel) selfContactLabel.textContent = user;

(async () => {
  const authUser = await ensureAuthenticatedSession();
  if (!authUser) return;
  if (selfContactLabel) selfContactLabel.textContent = user;
  const profileName = document.getElementById('profile-name');
  if (profileName) profileName.textContent = user;
})();

const ENCRYPTION_SCHEMES = ['AES-CBC', 'AES-CFB', 'AES-CTR'];
const ENCODE_PREFIX = 'ENC';

const hexToWordArray = (hex) => CryptoJS.enc.Hex.parse(hex);
const wordArrayToHex = (wordArray) => wordArray.toString(CryptoJS.enc.Hex);
const modeMap = {
  'AES-CBC': CryptoJS.mode.CBC,
  'AES-CFB': CryptoJS.mode.CFB,
  'AES-CTR': CryptoJS.mode.CTR,
};

const deriveKey = (pass, saltHex) => {
  const salt = hexToWordArray(saltHex);
  return CryptoJS.PBKDF2(pass, salt, { keySize: 256/32, iterations: 1200 });
};

const formatEncryptedPayload = (scheme, saltHex, ivHex, cipherBase64) => {
  return `${ENCODE_PREFIX}|${scheme}|${saltHex}|${ivHex}|${cipherBase64}`;
};

const encryptText = (text) => {
  try {
    const scheme = ENCRYPTION_SCHEMES[Math.floor(Math.random() * ENCRYPTION_SCHEMES.length)];
    const salt = CryptoJS.lib.WordArray.random(8);
    const iv = CryptoJS.lib.WordArray.random(16);
    const key = deriveKey(encryptionKey, wordArrayToHex(salt));
    const encrypted = CryptoJS.AES.encrypt(text, key, {
      iv,
      mode: modeMap[scheme],
      padding: CryptoJS.pad.Pkcs7,
    });
    const cipherBase64 = encrypted.ciphertext.toString(CryptoJS.enc.Base64);
    return formatEncryptedPayload(scheme, wordArrayToHex(salt), wordArrayToHex(iv), cipherBase64);
  } catch (e) {
    console.error('Encrypt error', e);
    return text;
  }
};

const decryptText = (cipher) => {
  if (!cipher || typeof cipher !== 'string') return cipher;

  const tryDecryptStructured = (value) => {
    const parts = value.split('|');
    if (parts.length !== 5 || parts[0] !== ENCODE_PREFIX) return null;
    const [, scheme, saltHex, ivHex, cipherBase64] = parts;
    if (!modeMap[scheme]) return null;
    try {
      const key = deriveKey(encryptionKey, saltHex);
      const iv = hexToWordArray(ivHex);
      const ciphertext = CryptoJS.enc.Base64.parse(cipherBase64);
      const bytes = CryptoJS.AES.decrypt({ ciphertext }, key, {
        iv,
        mode: modeMap[scheme],
        padding: CryptoJS.pad.Pkcs7,
      });
      const txt = bytes.toString(CryptoJS.enc.Utf8);
      return txt || null;
    } catch (e) {
      return null;
    }
  };

  const tryDecryptWithPassphrase = (pass) => {
    try {
      const key = CryptoJS.SHA256(pass);
      const iv = CryptoJS.MD5(pass);
      const bytes = CryptoJS.AES.decrypt(cipher, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
      const txt = bytes.toString(CryptoJS.enc.Utf8);
      if (txt) return txt;
    } catch (e) {}
    return null;
  };

  const tryLegacy = (pass) => {
    try {
      const bytes = CryptoJS.AES.decrypt(cipher, pass);
      const txt = bytes.toString(CryptoJS.enc.Utf8);
      if (txt) return txt;
    } catch (e) {}
    return null;
  };

  const structuredDec = tryDecryptStructured(cipher);
  if (structuredDec) return structuredDec;

  // Try current encryptionKey first, then fallback to DEFAULT_ENCRYPTION_KEY
  const keysToTry = [];
  if (encryptionKey) keysToTry.push(encryptionKey);
  if (DEFAULT_ENCRYPTION_KEY && DEFAULT_ENCRYPTION_KEY !== encryptionKey) keysToTry.push(DEFAULT_ENCRYPTION_KEY);

  for (const pass of keysToTry) {
    const dec = tryLegacy(pass);
    if (dec) return dec;
  }

  for (const pass of keysToTry) {
    const dec = tryDecryptWithPassphrase(pass);
    if (dec) return dec;
  }

  return cipher;
};

// Generate or reuse a persistent userId for per-user storage
if (!userId) {
  userId = `user-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  localStorage.setItem('synapse_user_id', userId);
}

const socket = io({ auth: { userId } });

let profileState = {
  name: user,
  bio: '',
  status: 'online',
  phone: '',
  avatar: ''
};
let currentUserContacts = [];

const normalizeContactEntry = (entry) => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { id: entry, name: entry, phone: '', status: 'offline' };
  }
  return {
    id: entry.id || entry.userId || entry.contactId || '',
    name: entry.name || entry.contactName || 'Контакт',
    phone: entry.phone || entry.number || '',
    status: entry.status || 'offline',
  };
};

const renderAllContactsList = () => {
  const list = document.getElementById('all-contacts-list');
  if (!list) return;

  if (!currentUserContacts.length) {
    list.innerHTML = '<li class="rogc contact-card"><span class="contact-name">Контактов пока нет</span></li>';
    return;
  }

  list.innerHTML = currentUserContacts
    .map((contact) => {
      const normalized = normalizeContactEntry(contact);
      const contactId = normalized?.id || '';
      const contactInfo = allOnlineUsers.find((u) => u.userId === contactId) || (normalized?.phone ? allOnlineUsers.find((u) => String(u.phone || '').replace(/\D/g, '') === String(normalized.phone).replace(/\D/g, '')) : null);
      const displayName = contactInfo?.name || normalized?.name || 'Контакт';
      const status = contactInfo?.status || normalized?.status || 'offline';
      const statusLabel = status === 'online' ? 'в сети' : 'был недавно';
      const avatar = getAvatarUrl(contactInfo?.userId || contactId || displayName);
      const phone = normalized?.phone ? `<span class="contact-phone">${escapeHtml(normalized.phone)}</span>` : '';
      return `
        <li class="contact-card" data-contact-id="${escapeHtml(contactId)}">
          <img src="${avatar}" width="34" height="34" alt="${escapeHtml(displayName)}">
          <div class="contact-name-wrap">
            <span class="contact-name">${escapeHtml(displayName)}</span>
            ${phone}
            <span class="contact-status ${status === 'online' ? 'online' : 'offline'}">${statusLabel}</span>
          </div>
          <div class="contact-actions">
            <button class="contact-action-btn" data-action="share-contact" data-contact-id="${escapeHtml(contactId)}" title="Поделиться контактом">↗</button>
            <button class="contact-action-btn" data-action="remove-contact" data-contact-id="${escapeHtml(contactId)}" title="Удалить контакт">✕</button>
          </div>
        </li>
      `;
    })
    .join('');
};

const profileNameInput = document.getElementById('profile-name-input');
const profileStatusSelect = document.getElementById('profile-status-select');
const profilePhoneInput = document.getElementById('profile-phone-input');
const profileBioInput = document.getElementById('profile-bio-input');
const profileSaveBtn = document.getElementById('profile-save-btn');
const phoneContactsInput = document.getElementById('phone-contacts-input');
const phoneSyncBtn = document.getElementById('phone-sync-btn');

async function fetchCurrentProfile() {
  try {
    const response = await fetch('/users/me', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.user) {
      const u = data.user;
      user = u.name || user;
      userId = u.id || userId;
      profileState = {
        name: u.name || user,
        bio: u.bio || '',
        status: u.status || 'online',
        phone: u.phone || '',
        avatar: u.avatar || ''
      };
      currentUserContacts = Array.isArray(u.contacts) ? u.contacts.map(normalizeContactEntry).filter(Boolean) : [];
      if (profileNameInput) profileNameInput.value = profileState.name;
      if (profileStatusSelect) profileStatusSelect.value = profileState.status;
      if (profilePhoneInput) profilePhoneInput.value = profileState.phone;
      if (profileBioInput) profileBioInput.value = profileState.bio;
      const profileName = document.getElementById('profile-name');
      if (profileName) profileName.textContent = profileState.name;
      localStorage.setItem('synapse_user_name', user);
      localStorage.setItem('synapse_user_id', userId);
      if (u.avatar) avatarMap[userId] = u.avatar;
      updateAllAvatars();
      renderAllContactsList();
      return u;
    }
  } catch (error) {
    console.warn('Failed to fetch profile', error);
  }
  return null;
}

async function saveProfile() {
  try {
    const payload = {
      name: profileNameInput?.value || user,
      bio: profileBioInput?.value || '',
      status: profileStatusSelect?.value || 'online',
      phone: profilePhoneInput?.value || '',
      avatar: avatarMap[userId] || ''
    };
    const response = await fetch('/users/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Save failed');
    }
    user = data.user.name || user;
    profileState = {
      name: data.user.name || payload.name,
      bio: data.user.bio || payload.bio,
      status: data.user.status || payload.status,
      phone: data.user.phone || payload.phone,
      avatar: data.user.avatar || payload.avatar,
    };
    localStorage.setItem('synapse_user_name', user);
    const profileNameEl = document.getElementById('profile-name');
    if (profileNameEl) profileNameEl.textContent = user;
    if (profileStatusSelect) profileStatusSelect.value = profileState.status;
    if (profileNameInput) profileNameInput.value = profileState.name;
    if (profilePhoneInput) profilePhoneInput.value = profileState.phone;
    if (profileBioInput) profileBioInput.value = profileState.bio;
    alert('Профиль сохранён');
    return data.user;
  } catch (error) {
    alert(error.message || 'Ошибка сохранения профиля');
    return null;
  }
}

async function syncPhoneContacts() {
  try {
    const raw = phoneContactsInput?.value?.trim() || '[]';
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Контакты должны быть массивом JSON объектов');
    }
    const response = await fetch('/users/sync-phone-contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ contacts: parsed }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Phone contact sync failed');
    }
    alert(`Импортировано ${data.imported.length} контактов`);
    return data;
  } catch (error) {
    alert(error.message || 'Ошибка импорта контактов');
    return null;
  }
}

if (profileSaveBtn) {
  profileSaveBtn.addEventListener('click', saveProfile);
}

if (phoneSyncBtn) {
  phoneSyncBtn.addEventListener('click', syncPhoneContacts);
}

// --- Avatar handling ---
let avatarMap = {}; // userId -> avatarUrl
let nameToUserId = {}; // userName -> userId

const getAvatarUrl = (userIdOrName) => {
  const url = avatarMap[userIdOrName];
  if (url) return url;
  // Try looking up by name
  const uid = nameToUserId[userIdOrName];
  if (uid && avatarMap[uid]) return avatarMap[uid];
  return './assets/circle-user-round.svg';
};

const updateAllAvatars = () => {
  // Update profile avatar in the modal
  const profileImg = document.getElementById('profile-avatar-img');
  if (profileImg) {
    profileImg.src = getAvatarUrl(userId);
  }
  // Update the contact list avatar (self)
  const selfContactAvatar = document.querySelector('#openModalBtn img');
  if (selfContactAvatar) {
    selfContactAvatar.src = getAvatarUrl(userId);
  }
  // Update all message avatars
  document.querySelectorAll('.fotor img').forEach((img) => {
    const msgEl = img.closest('[data-message-id]');
    if (!msgEl) return;
    const nameEl = msgEl.querySelector('.message_name');
    const name = nameEl ? nameEl.textContent.trim() : '';
    // Find the userId for this name
    for (const [uid, url] of Object.entries(avatarMap)) {
      if (uid === name || uid === userId) {
        img.src = url;
        break;
      }
    }
  });
  // Update contact list avatars
  document.querySelectorAll('#contacts .rogc img, #lifg .rogc img').forEach((img) => {
    const span = img.closest('li')?.querySelector('span');
    const name = span ? span.textContent.trim() : '';
    for (const [uid, url] of Object.entries(avatarMap)) {
      if (uid === name) {
        img.src = url;
        break;
      }
    }
  });
};

// Avatar file input handler
const avatarFileInput = document.getElementById('avatar-file-input');
const avatarBtn = document.getElementById('avatar');

if (avatarBtn && avatarFileInput) {
  avatarBtn.addEventListener('click', () => {
    avatarFileInput.click();
  });
  avatarFileInput.addEventListener('change', async () => {
    const file = avatarFileInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Аватарка не должна превышать 5 МБ');
      return;
    }
    try {
      const response = await fetch('/upload-avatar', {
        method: 'POST',
        headers: {
          'X-User-Id': userId,
          'Content-Type': file.type || 'image/jpeg',
        },
        body: file,
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Не удалось загрузить аватарку');
        return;
      }
      const data = await response.json();
      avatarMap[userId] = data.url;
      updateAllAvatars();
    } catch (e) {
      console.error('Avatar upload error', e);
      alert('Ошибка загрузки аватарки');
    }
  });
}

// --- Special Actions modal handlers ---
const specialActionsBtn = document.getElementById('special-actions-btn');
const specialActionsModal = document.getElementById('special-actions-modal');
const specialActionsClose = document.getElementById('special-actions-close');
const specialActionsList = document.getElementById('special-actions-list');

const openSpecialActions = () => {
  if (specialActionsModal) specialActionsModal.style.display = 'flex';
};

const closeSpecialActions = () => {
  if (specialActionsModal) specialActionsModal.style.display = 'none';
};

if (specialActionsBtn) specialActionsBtn.addEventListener('click', openSpecialActions);
if (specialActionsClose) specialActionsClose.addEventListener('click', closeSpecialActions);

// Close by clicking outside content
if (specialActionsModal) {
  specialActionsModal.addEventListener('click', (e) => {
    if (e.target === specialActionsModal) closeSpecialActions();
  });
}

// Handle actions
if (specialActionsList) {
  specialActionsList.addEventListener('click', (e) => {
    const btn = e.target.closest('.special-action');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (!action) return;
    if (action === 'clear-chat') {
      // clear messages from DOM and indexedDB for current view
      if (confirm('Уверены, что хотите очистить текущий чат?')) {
        clearAllMessagesFromDom();
        clearLocalMessages().then(() => alert('Чат очищен локально'));
      }
    } else if (action === 'export-messages') {
      getAllLocalMessages().then((msgs) => {
        const blob = new Blob([JSON.stringify(msgs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'synapse-messages.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    } else if (action === 'toggle-online') {
      profileState.status = profileState.status === 'online' ? 'offline' : 'online';
      if (profileStatusSelect) profileStatusSelect.value = profileState.status;
      saveProfile();
      alert(`Статус: ${profileState.status}`);
    }
    // close modal after action
    closeSpecialActions();
  });
}

// --- Chat background picker handlers ---
const chatBgColorInput = document.getElementById('chat-bg-color');
const chatBgFileInput = document.getElementById('chat-bg-file');
const chatBgResetBtn = document.getElementById('chat-bg-reset');
const chatBgPreview = document.getElementById('chat-bg-preview');
const chatMsgDialogEl = document.getElementById('chat-msg-dialog');

const applyChatBackground = (options = {}) => {
  if (!chatMsgDialogEl) return;
  if (options.imageUrl) {
    chatMsgDialogEl.style.background = `url('${options.imageUrl}') no-repeat center/cover`;
    chatMsgDialogEl.classList.add('chat-bg-applied');
  } else if (options.color) {
    chatMsgDialogEl.style.background = options.color;
    chatMsgDialogEl.classList.remove('chat-bg-applied');
  } else {
    chatMsgDialogEl.style.background = '#000';
    chatMsgDialogEl.classList.remove('chat-bg-applied');
  }
};

// Persist settings in localStorage
const CHAT_BG_KEY = `synapse_chat_bg_${userId}`;

const saveChatBgSetting = (obj) => {
  try {
    localStorage.setItem(CHAT_BG_KEY, JSON.stringify(obj));
  } catch (e) {}
};

const loadChatBgSetting = () => {
  try {
    const raw = localStorage.getItem(CHAT_BG_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
};

// Initialize preview and apply persisted
(() => {
  const saved = loadChatBgSetting();
  if (saved) {
    if (saved.imageUrl) {
      if (chatBgPreview) chatBgPreview.style.background = `url('${saved.imageUrl}') center/cover`;
      applyChatBackground({ imageUrl: saved.imageUrl });
    } else if (saved.color) {
      if (chatBgPreview) chatBgPreview.style.background = saved.color;
      applyChatBackground({ color: saved.color });
      if (chatBgColorInput) chatBgColorInput.value = saved.color;
    }
  }
})();

if (chatBgColorInput) {
  chatBgColorInput.addEventListener('input', (e) => {
    const col = e.target.value;
    if (chatBgPreview) chatBgPreview.style.background = col;
    applyChatBackground({ color: col });
    saveChatBgSetting({ color: col });
  });
}

if (chatBgFileInput) {
  chatBgFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      if (chatBgPreview) chatBgPreview.style.background = `url('${url}') center/cover`;
      applyChatBackground({ imageUrl: url });
      saveChatBgSetting({ imageUrl: url });
    };
    reader.readAsDataURL(file);
  });
}

if (chatBgResetBtn) {
  chatBgResetBtn.addEventListener('click', () => {
    if (chatBgPreview) chatBgPreview.style.background = '';
    applyChatBackground({});
    saveChatBgSetting({});
    if (chatBgColorInput) chatBgColorInput.value = '#000000';
    if (chatBgFileInput) chatBgFileInput.value = '';
  });
}

// Send user info to server on connect
socket.on('connect', () => {
  socket.emit('user info', { name: user, userId });
  const status = profileState.status || 'online';
  if (status !== 'offline') {
    saveProfile().catch(() => {});
  }
});

socket.on('user updated', (profile) => {
  if (!profile) return;
  user = profile.name || user;
  profileState = {
    ...profileState,
    name: profile.name || profileState.name,
    bio: profile.bio || profileState.bio,
    status: profile.status || profileState.status,
    phone: profile.phone || profileState.phone,
    avatar: profile.avatar || profileState.avatar,
  };
  const profileName = document.getElementById('profile-name');
  if (profileName) profileName.textContent = user;
  if (profileNameInput) profileNameInput.value = profileState.name;
  if (profileStatusSelect) profileStatusSelect.value = profileState.status;
  if (profileBioInput) profileBioInput.value = profileState.bio;
  if (profilePhoneInput) profilePhoneInput.value = profileState.phone;
});

socket.on('user info', (data) => {
  // This is sent from server as acknowledgment with name->userId mapping
  if (data && data.name && data.userId) {
    nameToUserId[data.name] = data.userId;
  }
});

// When server provides the shared encryption key, update and re-render messages
socket.on('encryption key', (key) => {
  if (!key) return;
  console.log('Received shared encryption key from server');
  encryptionKey = key;
  // expose to window for debugging and manual trigger
  try { window.encryptionKey = encryptionKey; } catch(e) {}
  try { window.DEFAULT_ENCRYPTION_KEY = DEFAULT_ENCRYPTION_KEY; } catch(e) {}
  // Re-render local messages so decrypted text appears
  (async () => {
    try {
      clearAllMessagesFromDom();
      const msgs = await getAllLocalMessages();
      msgs.forEach(renderMessage);
    } catch (e) {
      console.warn('Failed to re-render messages after key update', e);
    }
  })();
});

// Receive avatar map from server on connect
socket.on('avatar map', (map) => {
  if (map && typeof map === 'object') {
    avatarMap = map;
    updateAllAvatars();
  }
});

// Receive avatar update notification
socket.on('avatar updated', ({ userId: uid, url }) => {
  if (uid && url) {
    avatarMap[uid] = url;
    updateAllAvatars();
  }
});

// Also fetch the key over HTTP in case the socket event was missed
(async () => {
  try {
    const resp = await fetch('/encryption-key');
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.key) {
        encryptionKey = data.key;
        try { window.encryptionKey = encryptionKey; } catch (e) {}
        try { window.DEFAULT_ENCRYPTION_KEY = DEFAULT_ENCRYPTION_KEY; } catch (e) {}
        if (typeof window.reRenderMessages === 'function') await window.reRenderMessages();
      }
    }
  } catch (e) {
    // ignore fetch errors
  }
})();

// Expose decrypt helper for debugging
try { window.decryptText = (c) => decryptText(c); } catch (e) {}

// Expose a manual re-render utility for debugging
try {
  window.reRenderMessages = async () => {
    try {
      clearAllMessagesFromDom();
      const msgs = await getAllLocalMessages();
      msgs.forEach(renderMessage);
      return true;
    } catch (e) {
      console.error('reRenderMessages failed', e);
      return false;
    }
  };
} catch (e) {}

// --- IndexedDB simple wrapper for messages and outbox ---
const DB_NAME = 'synapse-db';
const DB_VERSION = 2;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
        if (!db.objectStoreNames.contains('messages')) {
          db.createObjectStore('messages', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { autoIncrement: true });
        }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveMessageLocal(message) {
  try {
    const db = await openDb();
    const tx = db.transaction('messages', 'readwrite');
    tx.objectStore('messages').put(message);
    return tx.complete;
  } catch (e) {
    console.warn('IDB save error', e);
  }
}

async function getAllLocalMessages() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
    req.onerror = () => reject(req.error);
  });
}

async function clearLocalMessages() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteMessageLocal(messageId) {
  if (!messageId) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite');
      const req = tx.objectStore('messages').delete(messageId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IDB delete error', e);
  }
}

async function addToOutbox(item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const req = store.add(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getOutboxItems() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearOutbox() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function flushOutbox() {
  const items = await getOutboxItems();
  if (!items.length) return;
  for (const item of items) {
    try {
      if (item.type === 'text') {
        socket.emit('chat message', { msg: item.msg, user_name: item.user_name, encrypted: item.encrypted });
      } else if (item.type === 'file' || item.type === 'voice') {
        const contentType = item.mimeType || (item.type === 'voice' ? 'audio/webm' : 'application/octet-stream');
        const headers = { 'X-Filename': encodeURIComponent(item.name), 'Content-Type': contentType };
        const response = await fetch('/upload', { method: 'POST', headers, body: item.blob });
        if (response.ok) {
          const data = await response.json();
          socket.emit(item.type === 'voice' ? 'voice message' : 'file message', { name: data.name, type: data.type, user_name: item.user_name, url: data.url });
        }
      }
    } catch (e) {
      console.warn('Flush outbox item failed, will retry later', e);
      return; // stop processing further to retry later
    }
  }
  await clearOutbox();
}

// On startup show locally stored messages (works if offline)
getAllLocalMessages().then((msgs) => {
  if (Array.isArray(msgs) && msgs.length) {
    msgBox.innerHTML = '';
    msgs.forEach(renderMessage);
  }
}).catch(() => {});

window.addEventListener('online', () => {
  flushOutbox();
});

const searchInput = document.getElementById('search');
const searchInputMobile = document.getElementById('search-mobile');
const addContactInput = document.getElementById('add-contact-input');
const addContactInputMobile = document.getElementById('add-contact-input-mobile');
const addContactBtn = document.getElementById('add-contact-btn');
const addContactBtnMobile = document.getElementById('add-contact-btn-mobile');

async function addContactByReference(identifier) {
  const value = String(identifier || '').trim();
  if (!value) {
    alert('Введите ID или номер контакта');
    return null;
  }
  try {
    const response = await fetch('/users/add-contact-by-reference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ identifier: value }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось добавить контакт');
    }
    alert(`Контакт ${data.contact?.name || value} добавлен`);
    if (addContactInput) addContactInput.value = '';
    if (addContactInputMobile) addContactInputMobile.value = '';
    await loadChatsAndGroups();
    await refreshCurrentContacts();
    return data;
  } catch (error) {
    alert(error.message || 'Ошибка добавления контакта');
    return null;
  }
}

async function refreshCurrentContacts() {
  try {
    const response = await fetch('/users/me', {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    const contacts = Array.isArray(data?.user?.contacts) ? data.user.contacts : [];
    currentUserContacts = contacts.map(normalizeContactEntry).filter(Boolean);
    renderAllContactsList();
    return currentUserContacts;
  } catch (error) {
    return [];
  }
}

async function removeContactById(contactId) {
  const value = String(contactId || '').trim();
  if (!value) return false;
  if (!confirm('Удалить контакт из списка?')) return false;

  try {
    const response = await fetch(`/users/contacts/${encodeURIComponent(value)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Не удалось удалить контакт');
    }
    await refreshCurrentContacts();
    return true;
  } catch (error) {
    alert(error.message || 'Ошибка удаления контакта');
    return false;
  }
}

async function shareContactById(contactId) {
  const value = String(contactId || '').trim();
  const contact = currentUserContacts.find((item) => String(normalizeContactEntry(item)?.id || '') === value);
  if (!contact) return;

  const normalized = normalizeContactEntry(contact);
  const text = `${normalized?.name || 'Контакт'}\nID: ${normalized?.id || '—'}\nТелефон: ${normalized?.phone || '—'}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Контакт SYNAPSE',
        text,
      });
      return;
    }
    await navigator.clipboard.writeText(text);
    alert('Контакт скопирован в буфер обмена');
  } catch (error) {
    try {
      await navigator.clipboard.writeText(text);
      alert('Контакт скопирован в буфер обмена');
    } catch (_) {
      alert('Не удалось поделиться контактом');
    }
  }
}

if (addContactBtn) {
  addContactBtn.addEventListener('click', () => addContactByReference(addContactInput?.value));
}
if (addContactBtnMobile) {
  addContactBtnMobile.addEventListener('click', () => addContactByReference(addContactInputMobile?.value));
}

const bindContactSearch = () => {
  [searchInput, searchInputMobile].forEach((input) => {
    if (!input) return;
    input.addEventListener('input', () => {
      contactSearchQuery = input.value.trim();
      renderChatLists();
      renderGroupLists();
      applyContactSearchFilter();
    });
  });
};

const toggleContactPanelBtn = document.getElementById('toggle-contact-panel-btn');
const allContactsList = document.getElementById('all-contacts-list');
if (toggleContactPanelBtn) {
  toggleContactPanelBtn.addEventListener('click', () => {
    const panel = document.getElementById('all-contacts-panel');
    if (!panel) return;
    panel.classList.toggle('hidden-panel');
  });
}

if (allContactsList) {
  allContactsList.addEventListener('click', async (event) => {
    const target = event.target.closest('.contact-action-btn');
    if (!target) return;
    const contactId = target.dataset.contactId;
    if (!contactId) return;

    if (target.dataset.action === 'remove-contact') {
      await removeContactById(contactId);
    }
    if (target.dataset.action === 'share-contact') {
      await shareContactById(contactId);
    }
  });
}

bindContactSearch();

// Simple helper to remove local placeholder messages when server message arrives
function removeLocalPlaceholdersFor(message) {
  try {
    const placeholders = Array.from(msgBox.querySelectorAll('[data-message-id]')).filter(el => el.dataset.messageId && el.dataset.messageId.startsWith('local-'));
    for (const ph of placeholders) {
      const nameEl = ph.querySelector('.message_name');
      const p = ph.querySelector('p');
      const name = nameEl ? nameEl.textContent : '';
      const text = p ? p.textContent : '';
      const displayed = message.encrypted ? decryptText(message.msg) : (message.msg || '');
      if ((message.user_name || '') === name && displayed === text) {
        ph.remove();
      }
    }
  } catch (e) {}
}



const createMessage = (msg, name, id, isOutgoing) => {
  const now = new Date();
  const currentDate = `${String(now.getHours()).padStart(2, '0')} : ${String(now.getMinutes()).padStart(2, '0')}`;
  const avatarUrl = getAvatarUrl(name);
  return `
    <div class="message ${isOutgoing ? 'message--outgoing' : 'message--incoming'}" data-message-id="${escapeHtml(id)}">
      <div class="message_overlay">
        <div class="fotor"><img src="${avatarUrl}" alt=""></div>
        <div class="line"></div>

        <div class="content">
          <div class="top">
            <div class="message_name">${escapeHtml(name)}</div>
            <button class="delete-message-btn" data-message-id="${escapeHtml(id)}" title="Удалить сообщение"><img src="./assets/trash-2.svg" alt=""></button>
          </div>
          <p>${escapeHtml(msg)}</p>
          <div class="date">${currentDate}</div>
        </div>
      </div>
    </div>`;
};

const playNotificationBeep = () => {};

const createFileMessage = (innerHtml, name, id, isOutgoing) => {
  const now = new Date();
  const currentDate = `${String(now.getHours()).padStart(2, '0')} : ${String(now.getMinutes()).padStart(2, '0')}`;
  const avatarUrl = getAvatarUrl(name);
  return `
    <div class="message message--file ${isOutgoing ? 'message--outgoing' : 'message--incoming'}" data-message-id="${escapeHtml(id)}">
      <div class="message_overlay">
        <div class="fotor"><img src="${avatarUrl}" alt=""></div>
        <div class="line"></div>
        <div class="content">
          <div class="top">
            <div class="message_name">${escapeHtml(name)}</div>
            <button class="delete-message-btn" data-message-id="${escapeHtml(id)}" title="Удалить сообщение"><img src="./assets/trash-2.svg" alt=""></button>
          </div>
          ${innerHtml}
          <div class="date">${currentDate}</div>
        </div>
      </div>
    </div>`;
};

const renderMessage = (message) => {
  if (!message || !message.id) return;
  if (msgBox.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`)) return;
  const isOutgoing = message.user_name === user;
  if (message.type === 'voice' || message.type === 'file') {
    msgBox.insertAdjacentHTML('beforeend', createFileMessage(getFileHtml(message), message.user_name || 'Сообщение', message.id, isOutgoing));
    return;
  }
  let displayed = message.msg || '';
  const decrypted = decryptText(message.msg);
  if (message.encrypted) {
    displayed = decrypted;
  } else if (decrypted && decrypted !== message.msg) {
    displayed = decrypted;
  }
  msgBox.insertAdjacentHTML('beforeend', createMessage(displayed, message.user_name || 'Пользователь', message.id, isOutgoing));
};

const removeMessageFromDom = (messageId) => {
  if (!messageId) return;
  const element = msgBox.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (element) element.remove();
  deleteMessageLocal(messageId);
};

const clearAllMessagesFromDom = () => {
  msgBox.innerHTML = '';
};

const getFileHtml = (payload) => {
    const safeName = escapeHtml(payload.name || "file");
    const lowerName = safeName.toLowerCase();
    const fileType = payload.type || "application/octet-stream";
    const url = payload.url || (payload.data ? URL.createObjectURL(new Blob([payload.data], { type: fileType })) : "");
    const isImage = fileType.startsWith("image/") || lowerName.endsWith(".svg") || lowerName.endsWith(".eps") || lowerName.endsWith(".ai");
    const isAudio = fileType.startsWith("audio/") || lowerName.match(/\.(mp3|wav|flac|aac|webm)$/);
    const isVideo = fileType.startsWith("video/") || lowerName.match(/\.(mp4|avi|mkv|mov|wmv)$/);
    const isPdf = fileType === "application/pdf" || lowerName.endsWith(".pdf");
    const isText = fileType.startsWith("text/") || lowerName.endsWith(".txt");
    const isDocument = lowerName.match(/\.(doc|docx|odt)$/);
    const isSpreadsheet = lowerName.match(/\.(xls|xlsx|csv)$/);
    const isPresentation = lowerName.match(/\.(ppt|pptx)$/);
    const isArchive = lowerName.match(/\.(zip|rar|7z|tar|gz|bz2)$/);
    const isSystem = lowerName.match(/\.(exe|bat|cmd|apk|app|dmg)$/);

    const downloadLink = url && !isAudio && !isVideo ? `<p class="message_file-link"><a href="${url}" download="${safeName}">Скачать ${safeName}</a></p>` : "";

    if (isImage && url) {
        return `<p class="message_file-preview"><a href="${url}" download="${safeName}"><img src="${url}" alt="${safeName}"></a></p>${downloadLink}`;
    }

    if (isAudio && url) {
        return `
          <div class="message_file-player">
            <div class="audio-player-row">
              <button type="button" class="audio-play-button" aria-label="Play audio">▶</button>
              <div class="audio-player-meta">
                <div class="audio-player-title">${safeName}</div>
                <div class="audio-player-time"><span class="audio-player-current">00:00</span> / <span class="audio-player-duration">00:00</span></div>
              </div>
            </div>
            <div class="audio-progress-bar">
              <div class="audio-progress-filled"></div>
            </div>
            <audio class="message_file-audio" src="${url}" preload="metadata"></audio>
          </div>`;
    }

    if (isVideo && url) {
        return `<video controls controlsList="nodownload" class="message_file-video" src="${url}"></video>`;
    }

    if (isPdf) {
        return `<p class="message_file-doc"><strong>PDF:</strong> ${safeName}</p>${downloadLink}`;
    }

    if (isText) {
        return `<p class="message_file-doc"><strong>Текстовый файл:</strong> ${safeName}</p>${downloadLink}`;
    }

    if (isDocument) {
        return `<p class="message_file-doc"><strong>Документ:</strong> ${safeName}</p>${downloadLink}`;
    }

    if (isSpreadsheet) {
        return `<p class="message_file-doc"><strong>Таблица:</strong> ${safeName}</p>${downloadLink}`;
    }

    if (isPresentation) {
        return `<p class="message_file-doc"><strong>Презентация:</strong> ${safeName}</p>${downloadLink}`;
    }

    if (isArchive) {
        return `<p class="message_file-doc"><strong>Архив:</strong> ${safeName}</p>${downloadLink}`;
    }

    if (isSystem) {
        return `<p class="message_file-doc"><strong>Системный файл:</strong> ${safeName}</p>${downloadLink}`;
    }

    return `<p class="message_file-doc"><strong>Файл:</strong> ${safeName}</p>${downloadLink}`;
};

const formatAudioDuration = (seconds) => {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
};

const updateAudioPlayerUI = (audio) => {
  const wrapper = audio.closest('.message_file-player');
  if (!wrapper) return;
  const current = wrapper.querySelector('.audio-player-current');
  const duration = wrapper.querySelector('.audio-player-duration');
  const progressFilled = wrapper.querySelector('.audio-progress-filled');
  const button = wrapper.querySelector('.audio-play-button');

  if (current) current.textContent = formatAudioDuration(audio.currentTime || 0);
  if (duration && audio.duration && !Number.isNaN(audio.duration)) duration.textContent = formatAudioDuration(audio.duration);
  if (progressFilled && audio.duration) {
    const percent = audio.currentTime / audio.duration * 100;
    progressFilled.style.width = `${percent}%`;
  }
  if (button) button.textContent = audio.paused ? '▶' : '❚❚';
};

let activeAudio = null;

const playAudioMessage = (audio, button) => {
  if (!audio) return;
  if (activeAudio && activeAudio !== audio) {
    activeAudio.pause();
    const activeWrapper = activeAudio.closest('.message_file-player');
    if (activeWrapper) {
      const activeButton = activeWrapper.querySelector('.audio-play-button');
      if (activeButton) activeButton.textContent = '▶';
    }
  }

  if (audio.paused) {
    audio.play();
    activeAudio = audio;
    button.textContent = '❚❚';
  } else {
    audio.pause();
    button.textContent = '▶';
  }
};

const sendMessage = () => {
  const msgValue = msgInput.value.trim();
  if (!msgValue) {
    alert('Мы не можем отправить пустую строку');
    return;
  }
  
  // If an active chat/group is selected, route to it
  if (activeChat) {
    const user_data = {
      msg: msgValue,
      user_name: user,
      chatId: activeChat.id,
    };
    if (encryptionKey && String(encryptionKey).trim()) {
      user_data.msg = encryptText(msgValue);
      user_data.encrypted = true;
    }
    if (!navigator.onLine) {
      const localId = `local-${Date.now()}`;
      const localMessage = { ...user_data, id: localId, type: 'text', timestamp: Date.now() };
      renderMessage(localMessage);
      saveMessageLocal(localMessage);
      alert('Вы в офлайне — сообщение поставлено в очередь.');
      msgInput.value = '';
      return;
    }
    const eventName = activeChat.type === 'group' ? 'group message' : 'chat message private';
    socket.emit(eventName, user_data);
    msgInput.value = '';
    return;
  }
  
  const user_data = {
    msg: msgValue,
    user_name: user,
  };

  if (encryptionKey && String(encryptionKey).trim()) {
    user_data.msg = encryptText(msgValue);
    user_data.encrypted = true;
  }

  // If offline, queue the message and show locally with a temporary id
  if (!navigator.onLine) {
    const localId = `local-${Date.now()}`;
    const localMessage = { ...user_data, id: localId, type: 'text', timestamp: Date.now() };
    renderMessage(localMessage);
    saveMessageLocal(localMessage);
    addToOutbox({ ...user_data, type: 'text', user_name: user, encrypted: user_data.encrypted });
    msgInput.value = '';
    alert('Вы в офлайне — сообщение поставлено в очередь и будет отправлено позже.');
    return;
  }

  socket.emit('chat message', user_data);
  msgInput.value = '';
};


const audioMessage = async () => {
    if (isAudioRecording && mediaRecording && mediaRecording.state === 'recording') {
      mediaRecording.stop();
      isAudioRecording = false;
      sendAudioMsgbtn?.classList.toggle('active');
      return;
    }

    try {
      if (typeof MediaRecorder === 'undefined') {
        alert('Ваш браузер не поддерживает запись голоса.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let voiceMimeType;
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        voiceMimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        voiceMimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        voiceMimeType = 'audio/wav';
      }

      audioChunks = [];
      const recorderOptions = voiceMimeType ? { mimeType: voiceMimeType } : {};
      mediaRecording = new MediaRecorder(stream, recorderOptions);
      mediaRecording.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };
      mediaRecording.onstop = async () => {
        console.log('запись остановлена, чанков:', audioChunks.length, 'mime:', voiceMimeType);
        const extension = voiceMimeType
          ? voiceMimeType.includes('ogg')
            ? 'ogg'
            : voiceMimeType.includes('wav')
            ? 'wav'
            : 'webm'
          : 'webm';
        const blob = new Blob(audioChunks, { type: voiceMimeType || 'audio/webm' });
        audioChunks = [];
        await uploadVoiceBlob(blob, `voice-${Date.now()}.${extension}`);
      };
      mediaRecording.start();
      isAudioRecording = true;
      sendAudioMsgbtn?.classList.toggle('active');
    } catch (e) {
      alert('Нет доступа к микрофону или запись не поддерживается');
      console.error(e);
    }
};

//Тип отправки сообщения через Enter
msgInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
//Тип отправки сообщения через кнопку
sendMsgBtn.addEventListener('click', ()=>{
    sendMessage();
});
audioMsgBtn.addEventListener('click',()=>{
    audioMessage();
});

deleteAllBtn?.addEventListener('click', async () => {
  if (!confirm('Удалить все сообщения?')) return;

  try {
    if (!navigator.onLine) {
      await clearLocalMessages();
      await clearOutbox();
      clearAllMessagesFromDom();
      alert('Все локальные сообщения удалены. Когда вы снова будете онлайн, ожидающие сообщения отправляться не будут.');
      return;
    }

    const response = await fetch('/messages', { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Не удалось удалить сообщения.');
      return;
    }
    await clearLocalMessages();
    await clearOutbox();
    clearAllMessagesFromDom();
  } catch (error) {
    console.error('Ошибка удаления всех сообщений', error);
    alert('Ошибка удаления всех сообщений.');
  }
});






socket.on('stored messages', (messages) => {
  msgBox.innerHTML = '';
  if (Array.isArray(messages)) {
    messages.forEach((m) => {
      saveMessageLocal(m);
      renderMessage(m);
    });
    // Also flush any local outbox when we receive stored messages (we are online)
    if (navigator.onLine) flushOutbox();
  }
});

socket.on('chat message', (message) => {
  // Remove local placeholder(s) if present
  removeLocalPlaceholdersFor(message);
  saveMessageLocal(message);
  renderMessage(message);
});

socket.on('voice message', (payload) => {
  saveMessageLocal(payload);
  renderMessage({ ...payload, type: 'voice' });
});

socket.on('file message', (payload) => {
  saveMessageLocal(payload);
  renderMessage({ ...payload, type: 'file' });
});

socket.on('message deleted', ({ id }) => {
  removeMessageFromDom(id);
});

socket.on('messages cleared', async () => {
  await clearLocalMessages();
  await clearOutbox();
  clearAllMessagesFromDom();
});



// Update users list
socket.on('users list', (users) => {
  if (Array.isArray(users)) {
    allOnlineUsers = users;
    renderAllContactsList();
  }
});

const getAudioFromMediaEvent = (event) => (
  event.target instanceof HTMLAudioElement && event.target.classList.contains('message_file-audio')
    ? event.target
    : null
);

msgBox.addEventListener('timeupdate', (event) => {
  const audio = getAudioFromMediaEvent(event);
  if (audio) updateAudioPlayerUI(audio);
}, true);

msgBox.addEventListener('loadedmetadata', (event) => {
  const audio = getAudioFromMediaEvent(event);
  if (audio) updateAudioPlayerUI(audio);
}, true);

msgBox.addEventListener('ended', (event) => {
  const audio = getAudioFromMediaEvent(event);
  if (!audio) return;
  const wrapper = audio.closest('.message_file-player');
  const button = wrapper?.querySelector('.audio-play-button');
  if (button) button.textContent = '▶';
  if (activeAudio === audio) activeAudio = null;
}, true);

msgBox.addEventListener('click', async (event) => {
  const audioButton = event.target.closest('.audio-play-button');
  if (audioButton) {
    const wrapper = audioButton.closest('.message_file-player');
    const audio = wrapper?.querySelector('.message_file-audio');
    playAudioMessage(audio, audioButton);
    return;
  }

  const progressBar = event.target.closest('.audio-progress-bar');
  if (progressBar) {
    const wrapper = progressBar.closest('.message_file-player');
    const audio = wrapper?.querySelector('.message_file-audio');
    if (!audio || !audio.duration) return;
    const rect = progressBar.getBoundingClientRect();
    const percent = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = percent * audio.duration;
    updateAudioPlayerUI(audio);
    return;
  }

  const button = event.target.closest('.delete-message-btn');
  if (!button) return;
  const messageId = button.dataset.messageId;
  if (!messageId) return;

  if (!confirm('Удалить это сообщение?')) return;

  try {
    const response = await fetch(`/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Не удалось удалить сообщение.');
      return;
    }
    removeMessageFromDom(messageId);
  } catch (error) {
    console.error('Ошибка удаления сообщения', error);
    alert('Ошибка удаления сообщения.');
  }
});

const uploadVoiceBlob = async (blob, fileName) => {
  try {
    console.log('Отправка голосового сообщения, размер:', blob.size, 'тип:', blob.type);
    if (!navigator.onLine) {
      const localId = `local-${Date.now()}`;
      const localUrl = URL.createObjectURL(blob);
      const localPayload = { id: localId, name: fileName, type: blob.type || 'audio/webm', user_name: user, url: localUrl, timestamp: Date.now() };
      // render local voice message and queue blob
      msgBox.insertAdjacentHTML('beforeend', createFileMessage(getFileHtml(localPayload), user, localId, true));
      saveMessageLocal({ ...localPayload, type: 'voice' });
      await addToOutbox({ type: 'voice', name: fileName, blob, mimeType: blob.type || 'audio/webm', user_name: user });
      return;
    }

    const response = await fetch('/upload', {
      method: 'POST',
      headers: {
        'X-Filename': encodeURIComponent(fileName),
        'Content-Type': blob.type || 'audio/webm',
      },
      body: blob,
    });
    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
    const data = await response.json();
    if (activeChat) {
      const eventName = activeChat.type === 'group' ? 'voice message group' : 'voice message private';
      socket.emit(eventName, {
        name: data.name,
        type: data.type,
        user_name: user,
        url: data.url,
        chatId: activeChat.id,
        groupId: activeChat.type === 'group' ? activeChat.id : undefined,
      });
    } else {
      socket.emit('voice message', {
        name: data.name,
        type: data.type,
        user_name: user,
        url: data.url,
      });
    }
  } catch (error) {
    console.error('Ошибка загрузки голосового сообщения', error);
    alert('Не удалось отправить голосовое сообщение. Попробуйте ещё раз.');
  }
};

const sendSelectedFile = () => {
  const file = modalFileInput.files?.[0];
  if (!file) {
    alert('Выберите файл');
    return;
  }

  modalSendFileBtn.disabled = true;
  modalUploadProgressWrapper.classList.remove('hidden');
  setUploadProgress(0);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/upload');
  xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
  xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      setUploadProgress(percent);
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      const response = JSON.parse(xhr.responseText);
      if (activeChat) {
        const eventName = activeChat.type === 'group' ? 'file message group' : 'file message private';
        socket.emit(eventName, {
          name: response.name,
          type: response.type,
          user_name: user,
          url: response.url,
          chatId: activeChat.id,
          groupId: activeChat.type === 'group' ? activeChat.id : undefined,
        });
      } else {
        socket.emit('file message', {
          name: response.name,
          type: response.type,
          user_name: user,
          url: response.url,
        });
      }
      closeModal();
    } else {
      alert('Ошибка при загрузке файла. Сервер вернул статус ' + xhr.status);
      modalSendFileBtn.disabled = false;
      modalUploadProgressWrapper.classList.add('hidden');
    }
  };

  // If offline - queue file in outbox and render local preview
  if (!navigator.onLine) {
    const localId = `local-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    const localPayload = { id: localId, name: file.name, type: file.type, user_name: user, url: localUrl, timestamp: Date.now() };
    msgBox.insertAdjacentHTML('beforeend', createFileMessage(getFileHtml(localPayload), user, localId, true));
    saveMessageLocal({ ...localPayload, type: 'file' });
    addToOutbox({ type: 'file', name: file.name, blob: file, mimeType: file.type || 'application/octet-stream', user_name: user });
    closeModal();
    return;
  }

  xhr.onerror = () => {
    alert('Ошибка при загрузке файла. Попробуйте ещё раз.');
    modalSendFileBtn.disabled = false;
    modalUploadProgressWrapper.classList.add('hidden');
  };

  xhr.send(file);
};

modalFileInput.addEventListener("change", () => {
    const file = modalFileInput.files?.[0];
    if (file) {
        modalFileLabel.textContent = file.name;
        modalSendFileBtn.disabled = false;
    } else {
        modalFileLabel.textContent = "";
        modalSendFileBtn.disabled = true;
    }
});

modalSendFileBtn.addEventListener("click", sendSelectedFile);

openModalBtn.addEventListener('click', openModal);
closeModalBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}

// PWA install prompt handling
let deferredPrompt = null;
const pwaInstallBtn = document.getElementById('pwa-install-btn');
const downloadProjectBtn = document.getElementById('download-project-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (pwaInstallBtn) {
    pwaInstallBtn.classList.remove('hidden');
    pwaInstallBtn.addEventListener('click', async () => {
      pwaInstallBtn.disabled = true;
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      pwaInstallBtn.disabled = false;
      if (choice.outcome === 'accepted') {
        pwaInstallBtn.classList.add('hidden');
      }
      deferredPrompt = null;
    }, { once: true });
  }
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  if (pwaInstallBtn) pwaInstallBtn.classList.add('hidden');
});

if (downloadProjectBtn) {
  downloadProjectBtn.addEventListener('click', () => {
    window.location.href = '/download-project';
  });
}

// ========================
// CHAT / GROUP SYSTEM
// ========================

let activeChat = null; // { id, type: 'private'|'group', name }

// Camera avatar capture
const cameraFileInput = document.getElementById('camera-file-input');
const cameraAvatarBtn = document.getElementById('camera-avatar-btn');
if (cameraAvatarBtn && cameraFileInput) {
  cameraAvatarBtn.addEventListener('click', () => {
    cameraFileInput.click();
  });
  cameraFileInput.addEventListener('change', async () => {
    const file = cameraFileInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Фото не должно превышать 5 МБ');
      return;
    }
    // Convert to data URL for upload
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      try {
        const response = await fetch('/upload-avatar', {
          method: 'POST',
          headers: {
            'X-User-Id': userId,
            'Content-Type': 'text/plain',
          },
          body: dataUrl,
        });
        if (!response.ok) {
          const data = await response.json();
          alert(data.error || 'Не удалось загрузить фото');
          return;
        }
        const data = await response.json();
        avatarMap[userId] = data.url;
        updateAllAvatars();
      } catch (err) {
        console.error('Camera avatar upload error', err);
        alert('Ошибка загрузки фото');
      }
    };
    reader.readAsDataURL(file);
  });
}

// --- Chat / Group UI creation ---
const createChatBtn = document.getElementById('create-chat-btn');
const createChatModal = document.getElementById('create-chat-modal');
const createChatInput = document.getElementById('create-chat-input');
const createChatUsersList = document.getElementById('create-chat-users-list');
const createChatSubmit = document.getElementById('create-chat-submit');
const createChatClose = document.getElementById('create-chat-close');

const createGroupBtn = document.getElementById('create-group-btn');
const createGroupModal = document.getElementById('create-group-modal');
const createGroupNameInput = document.getElementById('create-group-name');
const createGroupUsersList = document.getElementById('create-group-users-list');
const createGroupSubmit = document.getElementById('create-group-submit');
const createGroupClose = document.getElementById('create-group-close');

const chatListEl = document.getElementById('chat-list');
const chatListMobileEl = document.getElementById('chat-list-mobile');
const groupListEl = document.getElementById('group-list');
const groupListMobileEl = document.getElementById('group-list-mobile');
const chatHeader = document.getElementById('chat-header');

// --- Load chats and groups ---
let myChats = {};
let myGroups = {};
let allOnlineUsers = [];
let contactSearchQuery = '';

function applyContactSearchFilter() {
  const normalized = String(contactSearchQuery || '').trim().toLowerCase();
  const filterItems = (items) => {
    items.forEach((item) => {
      if (!item) return;
      const text = (item.textContent || '').toLowerCase();
      item.style.display = (!normalized || text.includes(normalized)) ? '' : 'none';
    });
  };

  const chatItems = document.querySelectorAll('.chat-item');
  const groupItems = document.querySelectorAll('.group-item');
  filterItems(chatItems);
  filterItems(groupItems);
}

async function loadChatsAndGroups() {
  try {
    const [chatsRes, groupsRes] = await Promise.all([
      fetch('/chats'),
      fetch('/groups'),
    ]);
    if (chatsRes.ok) myChats = await chatsRes.json();
    if (groupsRes.ok) myGroups = await groupsRes.json();
  } catch (e) {
    console.warn('Failed to load chats/groups', e);
  }
  renderChatLists();
  renderGroupLists();
}

function renderChatLists() {
  const myUserId = userId;
  const myChatsArray = Object.values(myChats).filter(chat =>
    chat.participants && chat.participants.includes(myUserId)
  ) || [];
  
  const renderChat = (chat) => {
    const otherParticipant = chat.participants.find(p => p !== myUserId);
    const otherUserInfo = allOnlineUsers.find(u => u.userId === otherParticipant);
    const chatName = otherUserInfo ? otherUserInfo.name : (otherParticipant || 'Чат');
    const avatarUrl = getAvatarUrl(otherParticipant);
    const isActive = activeChat && activeChat.id === chat.id;
    const matchesQuery = !contactSearchQuery || String(chatName || '').toLowerCase().includes(contactSearchQuery.toLowerCase());
    if (!matchesQuery) return '';
    const status = otherUserInfo ? (otherUserInfo.status || 'online') : 'offline';
    const statusLabel = status === 'online' ? 'в сети' : 'был недавно';
    return `<li class="rogc chat-item ${isActive ? 'chat-item-active' : ''}" data-chat-id="${chat.id}" data-chat-type="private" data-chat-name="${escapeHtml(chatName)}">
      <img src="${avatarUrl}" width="36px" height="36px" alt="">
      <div class="contact-name-wrap">
        <span class="contact-name">${escapeHtml(chatName)}</span>
        <span class="contact-status ${status === 'online' ? 'online' : 'offline'}">${statusLabel}</span>
      </div>
      <div class="pules"></div>
    </li>`;
  };
  
  if (chatListEl) {
    chatListEl.innerHTML = myChatsArray.map(renderChat).join('');
  }
  if (chatListMobileEl) {
    chatListMobileEl.innerHTML = myChatsArray.map(renderChat).join('');
  }
}

function renderGroupLists() {
  const myUserId = userId;
  const myGroupsArray = Object.values(myGroups).filter(g =>
    g.members && g.members.includes(myUserId)
  ) || [];
  
  const renderGroup = (group) => {
    const isActive = activeChat && activeChat.id === group.id;
    const matchesQuery = !contactSearchQuery || String(group.name || '').toLowerCase().includes(contactSearchQuery.toLowerCase());
    if (!matchesQuery) return '';
    return `<li class="rogc group-item ${isActive ? 'chat-item-active' : ''}" data-chat-id="${group.id}" data-chat-type="group" data-chat-name="${escapeHtml(group.name)}">
      <span style="font-size:24px;">👥</span>
      <span>${escapeHtml(group.name)}</span>
      <span style="font-size:12px;color:gray;">${group.members.length} уч.</span>
    </li>`;
  };
  
  if (groupListEl) {
    groupListEl.innerHTML = myGroupsArray.map(renderGroup).join('');
  }
  if (groupListMobileEl) {
    groupListMobileEl.innerHTML = myGroupsArray.map(renderGroup).join('');
  }
}

function switchToChat(chatId, chatType, chatName) {
  activeChat = { id: chatId, type: chatType, name: chatName };
  // Clear messages and load
  clearAllMessagesFromDom();
  
  if (chatHeader) {
    chatHeader.style.display = 'block';
    chatHeader.textContent = chatType === 'group' ? '👥 ' + chatName : '💬 ' + chatName;
  }
  
  // Highlight active
  document.querySelectorAll('.chat-item, .group-item').forEach(el => el.classList.remove('chat-item-active'));
  document.querySelectorAll(`[data-chat-id="${chatId}"]`).forEach(el => el.classList.add('chat-item-active'));
  
  // Load messages for this chat
  const endpoint = chatType === 'group'
    ? `/groups/${chatId}/messages`
    : `/chats/${chatId}/messages`;
  fetch(endpoint)
    .then(res => res.json())
    .then(msgs => {
      if (Array.isArray(msgs)) {
        msgs.forEach(m => renderMessage(m));
      }
    })
    .catch(e => console.warn('Failed to load messages', e));
  
  // Hide mobile contacts
  hideMobileContacts();
}

// Click handlers for chat/group items
function setupChatNavigation() {
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.chat-item, .group-item');
    if (!item) return;
    const chatId = item.dataset.chatId;
    const chatType = item.dataset.chatType;
    const chatName = item.dataset.chatName;
    if (chatId && chatType) {
      switchToChat(chatId, chatType, chatName);
    }
  });
}

setupChatNavigation();

// Socket handlers for chat/group messages
socket.on('chat message private', (message) => {
  if (activeChat && activeChat.type === 'private' && activeChat.id === message.chatId) {
    saveMessageLocal(message);
    renderMessage(message);
  }
  // Refresh chat list to show any new chat
  loadChatsAndGroups();
});

socket.on('voice message private', (message) => {
  if (activeChat && activeChat.type === 'private' && activeChat.id === message.chatId) {
    saveMessageLocal(message);
    renderMessage(message);
  }
});

socket.on('file message private', (message) => {
  if (activeChat && activeChat.type === 'private' && activeChat.id === message.chatId) {
    saveMessageLocal(message);
    renderMessage(message);
  }
});

socket.on('group message', (message) => {
  if (activeChat && activeChat.type === 'group' && activeChat.id === message.groupId) {
    saveMessageLocal(message);
    renderMessage(message);
  }
});

socket.on('voice message group', (message) => {
  if (activeChat && activeChat.type === 'group' && activeChat.id === message.groupId) {
    saveMessageLocal(message);
    renderMessage(message);
  }
});

socket.on('file message group', (message) => {
  if (activeChat && activeChat.type === 'group' && activeChat.id === message.groupId) {
    saveMessageLocal(message);
    renderMessage(message);
  }
});

socket.on('group created', (group) => {
  myGroups[group.id] = group;
  renderGroupLists();
});

socket.on('group updated', (group) => {
  myGroups[group.id] = group;
  renderGroupLists();
});

// --- Create Chat logic ---
if (createChatBtn) {
  createChatBtn.addEventListener('click', () => {
    if (createChatModal) createChatModal.style.display = 'flex';
    // Populate users list
    if (createChatUsersList) {
      createChatUsersList.innerHTML = '';
      const myUserId = userId;
      const existingChatUserIds = new Set();
      Object.values(myChats).forEach(chat => {
        if (chat.participants) {
          chat.participants.forEach(p => existingChatUserIds.add(p));
        }
      });
      allOnlineUsers
        .filter(u => u.userId !== myUserId && u.name)
        .forEach(u => {
          const alreadyHasChat = existingChatUserIds.has(u.userId);
          const label = document.createElement('label');
          label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;background:#1a1a1a;color:#fff;cursor:pointer;';
          label.innerHTML = `<input type="radio" name="chat-user" value="${u.userId}" data-name="${escapeHtml(u.name)}">
            <img src="${getAvatarUrl(u.userId)}" width="28px" height="28px" style="border-radius:50%;">
            <span>${escapeHtml(u.name)}</span>
            ${alreadyHasChat ? '<span style="color:gray;font-size:11px;">(чат уже есть)</span>' : ''}`;
          createChatUsersList.appendChild(label);
        });
      if (createChatUsersList.children.length === 0) {
        createChatUsersList.innerHTML = '<p style="color:gray;text-align:center;">Нет других пользователей онлайн</p>';
      }
    }
    createChatSubmit.disabled = true;
  });
}

if (createChatClose) {
  createChatClose.addEventListener('click', () => {
    if (createChatModal) createChatModal.style.display = 'none';
  });
}

if (createChatUsersList) {
  createChatUsersList.addEventListener('change', () => {
    const selected = createChatUsersList.querySelector('input[name="chat-user"]:checked');
    createChatSubmit.disabled = !selected;
  });
}

if (createChatSubmit) {
  createChatSubmit.addEventListener('click', async () => {
    const selected = createChatUsersList.querySelector('input[name="chat-user"]:checked');
    if (!selected) {
      alert('Выберите пользователя');
      return;
    }
    const targetUserId = selected.value;
    const targetUserName = selected.dataset.name || targetUserId;
    createChatSubmit.disabled = true;
    try {
      const res = await fetch('/chats/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, targetUserName, myUserId: userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Не удалось создать чат');
        return;
      }
      const data = await res.json();
      myChats[data.chat.id] = data.chat;
      renderChatLists();
      if (createChatModal) createChatModal.style.display = 'none';
      switchToChat(data.chat.id, 'private', targetUserName);
    } catch (e) {
      console.error('Create chat error', e);
      alert('Ошибка создания чата');
    }
    createChatSubmit.disabled = false;
  });
}

// --- Create Group logic ---
if (createGroupBtn) {
  createGroupBtn.addEventListener('click', () => {
    if (createGroupModal) createGroupModal.style.display = 'flex';
    if (createGroupUsersList) {
      createGroupUsersList.innerHTML = '<p style="color:gray;text-align:center;">Выберите участников:</p>';
      const myUserId = userId;
      allOnlineUsers
        .filter(u => u.userId !== myUserId && u.name)
        .forEach(u => {
          const label = document.createElement('label');
          label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px;background:#1a1a1a;color:#fff;cursor:pointer;';
          label.innerHTML = `<input type="checkbox" name="group-user" value="${u.userId}">
            <img src="${getAvatarUrl(u.userId)}" width="28px" height="28px" style="border-radius:50%;">
            <span>${escapeHtml(u.name)}</span>`;
          createGroupUsersList.appendChild(label);
        });
      if (createGroupUsersList.children.length <= 1) {
        createGroupUsersList.innerHTML = '<p style="color:gray;text-align:center;">Нет других пользователей онлайн</p>';
      }
    }
    createGroupSubmit.disabled = true;
  });
}

if (createGroupClose) {
  createGroupClose.addEventListener('click', () => {
    if (createGroupModal) createGroupModal.style.display = 'none';
  });
}

if (createGroupNameInput) {
  createGroupNameInput.addEventListener('input', () => {
    const hasName = createGroupNameInput.value.trim().length > 0;
    const hasUsers = createGroupUsersList.querySelectorAll('input[name="group-user"]:checked').length > 0;
    createGroupSubmit.disabled = !(hasName && hasUsers);
  });
}

if (createGroupUsersList) {
  createGroupUsersList.addEventListener('change', () => {
    const hasName = createGroupNameInput ? createGroupNameInput.value.trim().length > 0 : false;
    const hasUsers = createGroupUsersList.querySelectorAll('input[name="group-user"]:checked').length > 0;
    createGroupSubmit.disabled = !(hasName && hasUsers);
  });
}

if (createGroupSubmit) {
  createGroupSubmit.addEventListener('click', async () => {
    const groupName = createGroupNameInput ? createGroupNameInput.value.trim() : '';
    if (!groupName) { alert('Введите название группы'); return; }
    const selectedUsers = [];
    if (createGroupUsersList) {
      createGroupUsersList.querySelectorAll('input[name="group-user"]:checked').forEach(cb => {
        selectedUsers.push(cb.value);
      });
    }
    if (selectedUsers.length === 0) { alert('Выберите хотя бы одного участника'); return; }
    createGroupSubmit.disabled = true;
    try {
      const res = await fetch('/groups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: groupName, creatorId: userId, members: [userId, ...selectedUsers] }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Не удалось создать группу');
        return;
      }
      const data = await res.json();
      myGroups[data.group.id] = data.group;
      renderGroupLists();
      if (createGroupModal) createGroupModal.style.display = 'none';
      switchToChat(data.group.id, 'group', groupName);
    } catch (e) {
      console.error('Create group error', e);
      alert('Ошибка создания группы');
    }
    createGroupSubmit.disabled = false;
  });
}

// Load chats on startup
loadChatsAndGroups();

 // end authenticated block

