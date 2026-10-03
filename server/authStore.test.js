const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AuthStore } = require('./authStore');

const testRoot = path.join(__dirname, 'tmp-auth-test');

test('register, login, password reset, profile update and phone contacts sync work', async () => {
  await fs.promises.rm(testRoot, { recursive: true, force: true });

  const store = new AuthStore({ rootDir: testRoot });

  store.requestCode({
    login: 'abandoned@example.com',
    purpose: 'register'
  });
  store.clearCode('abandoned@example.com');
  assert.throws(
    () => store.validateCode({ login: 'abandoned@example.com', code: '000000', purpose: 'register' }),
    /Код подтверждения не найден/
  );

  const registerRequest = await store.requestCode({
    login: 'user@example.com',
    purpose: 'register',
    name: 'Test User',
    password: 'Pass123!'
  });

  assert.ok(registerRequest.code, 'register request should produce a code');

  const registerResult = await store.register({
    name: 'Test User',
    login: 'user@example.com',
    password: 'Pass123!',
    code: registerRequest.code
  });

  assert.equal(registerResult.user.name, 'Test User');
  assert.ok(registerResult.session && registerResult.session.token);

  const reloadedStore = new AuthStore({ rootDir: testRoot });
  const persistedLogin = await reloadedStore.login({
    login: 'user@example.com',
    password: 'Pass123!'
  });
  assert.ok(persistedLogin.session && persistedLogin.session.token, 'registered account should survive store reload');

  const profileResult = store.updateProfile({
    userId: registerResult.user.id,
    name: 'Updated Name',
    bio: 'Hello world',
    status: 'offline',
    avatar: '/avatars/test.png'
  });

  assert.equal(profileResult.user.name, 'Updated Name');
  assert.equal(profileResult.user.status, 'offline');
  assert.equal(profileResult.user.bio, 'Hello world');

  const contactSync = store.syncPhoneContacts({
    userId: registerResult.user.id,
    contacts: [
      { name: 'Alice', phone: '+79990000001' },
      { name: 'Bob', phone: '+79990000002' }
    ]
  });

  assert.equal(contactSync.imported.length, 2);
  assert.equal(contactSync.user.contacts.length, 2);

  const secondUser = store.register({
    name: 'Contact User',
    login: 'contact@example.com',
    password: 'Secure321!',
    code: store.requestCode({ login: 'contact@example.com', purpose: 'register', name: 'Contact User', password: 'Secure321!' }).code
  });

  store.updateProfile({
    userId: secondUser.user.id,
    phone: '+79990000099'
  });

  const byIdResult = store.addContactByReference({
    userId: registerResult.user.id,
    identifier: secondUser.user.id,
  });

  assert.equal(byIdResult.ok, true);
  assert.equal(byIdResult.contact.id, secondUser.user.id);

  const byPhoneResult = store.addContactByReference({
    userId: registerResult.user.id,
    identifier: '+79990000099',
  });

  assert.equal(byPhoneResult.ok, true);
  assert.equal(byPhoneResult.contact.id, secondUser.user.id);

  const removeResult = store.removeContact({
    userId: registerResult.user.id,
    contactId: secondUser.user.id,
  });

  assert.equal(removeResult.ok, true);
  assert.equal(removeResult.contacts.some((item) => {
    const id = typeof item === 'string' ? item : item?.id || item?.userId;
    return id === secondUser.user.id;
  }), false);

  const loginResult = await store.login({
    login: 'user@example.com',
    password: 'Pass123!'
  });

  assert.ok(loginResult.session && loginResult.session.token);

  const resetRequest = await store.requestCode({
    login: 'user@example.com',
    purpose: 'reset'
  });

  assert.ok(resetRequest.code, 'password reset request should produce a code');

  const resetResult = await store.resetPassword({
    login: 'user@example.com',
    code: resetRequest.code,
    newPassword: 'NewPass456!'
  });

  assert.equal(resetResult.ok, true);

  const nextLogin = await store.login({
    login: 'user@example.com',
    password: 'NewPass456!'
  });

  assert.ok(nextLogin.session && nextLogin.session.token);

  await fs.promises.rm(testRoot, { recursive: true, force: true });
});
