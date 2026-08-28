(function () {
  'use strict';

  var SESSION_KEY = 'zijie-profile-unlocked-v1';
  var PAYLOAD_URL = '/assets/data/profile.enc.json?v=1';
  var LINK_PAYLOAD_URL = '/assets/data/profile.link.enc.json?v=1';

  function base64ToBytes(value) {
    var binary = window.atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  async function decryptProfile(passphrase, payloadUrl) {
    var response = await window.fetch(payloadUrl || PAYLOAD_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('payload');
    }

    var payload = await response.json();
    var passwordKey = await window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    var key = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: base64ToBytes(payload.salt),
        iterations: payload.iterations,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    var plaintext = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(payload.iv), tagLength: 128 },
      key,
      base64ToBytes(payload.data)
    );
    var profile = JSON.parse(new TextDecoder().decode(plaintext));

    if (!profile.contentHtml || !profile.sidebarHtml) {
      throw new Error('profile');
    }
    return profile;
  }

  function showFullProfile(profile) {
    var content = document.querySelector('.page__content');
    var sidebar = document.querySelector('.profile_box');
    if (!content || !sidebar) {
      return false;
    }

    content.innerHTML = profile.contentHtml;
    sidebar.innerHTML = profile.sidebarHtml;
    document.documentElement.classList.remove('profile-locked');
    document.documentElement.classList.add('profile-unlocked');
    window.dispatchEvent(new Event('resize'));
    return true;
  }

  function restoreSession() {
    try {
      var stored = window.sessionStorage.getItem(SESSION_KEY);
      if (!stored) {
        return false;
      }
      return showFullProfile(JSON.parse(stored));
    } catch (error) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
  }

  function createUnlockDialog() {
    var overlay = document.createElement('div');
    overlay.className = 'profile-gate-overlay';
    overlay.hidden = true;
    overlay.innerHTML = [
      '<div class="profile-gate-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-gate-title">',
      '<button class="profile-gate-close" type="button" aria-label="关闭">&times;</button>',
      '<h2 id="profile-gate-title">访问完整主页</h2>',
      '<p>请输入访问口令。</p>',
      '<form class="profile-gate-form">',
      '<label for="profile-gate-password">访问口令</label>',
      '<input id="profile-gate-password" name="password" type="password" autocomplete="current-password" required>',
      '<p class="profile-gate-message" aria-live="polite"></p>',
      '<button class="profile-gate-submit" type="submit">解锁主页</button>',
      '</form>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    var dialog = overlay.querySelector('.profile-gate-dialog');
    var form = overlay.querySelector('.profile-gate-form');
    var input = overlay.querySelector('#profile-gate-password');
    var message = overlay.querySelector('.profile-gate-message');
    var submit = overlay.querySelector('.profile-gate-submit');
    var close = overlay.querySelector('.profile-gate-close');

    function openDialog() {
      overlay.hidden = false;
      message.textContent = '';
      window.setTimeout(function () { input.focus(); }, 0);
    }

    function closeDialog() {
      overlay.hidden = true;
      form.reset();
      message.textContent = '';
    }

    close.addEventListener('click', closeDialog);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        closeDialog();
      }
    });
    dialog.addEventListener('click', function (event) {
      event.stopPropagation();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !overlay.hidden) {
        closeDialog();
      }
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = '正在验证…';

      try {
        var profile = await decryptProfile(input.value);
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile));
        showFullProfile(profile);
        closeDialog();
      } catch (error) {
        message.textContent = error && error.message === 'payload'
          ? '暂时无法读取加密内容，请稍后重试。'
          : '口令不正确，请重新输入。';
        input.select();
      } finally {
        submit.disabled = false;
      }
    });

    return openDialog;
  }

  function attachHiddenEntrance(openDialog) {
    var avatar = document.querySelector('.profile_box .author__avatar img');
    if (!avatar) {
      return;
    }

    var clicks = [];
    avatar.addEventListener('click', function () {
      var now = Date.now();
      clicks = clicks.filter(function (timestamp) { return now - timestamp < 3500; });
      clicks.push(now);
      if (clicks.length >= 5) {
        clicks = [];
        openDialog();
      }
    });
  }

  function readPrivateLinkKey() {
    var match = window.location.hash.match(/^#profile=([A-Za-z0-9_-]+)$/);
    return match ? match[1] : '';
  }

  function clearPrivateLinkKey() {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }

  async function initialize() {
    var linkKey = readPrivateLinkKey();
    if (restoreSession()) {
      if (linkKey) {
        clearPrivateLinkKey();
      }
      return;
    }

    if (linkKey) {
      try {
        var linkedProfile = await decryptProfile(linkKey, LINK_PAYLOAD_URL);
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(linkedProfile));
        showFullProfile(linkedProfile);
        clearPrivateLinkKey();
        return;
      } catch (error) {
        clearPrivateLinkKey();
      }
    }

    var openDialog = createUnlockDialog();
    attachHiddenEntrance(openDialog);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
}());
