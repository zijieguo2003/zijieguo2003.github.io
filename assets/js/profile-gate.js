(function () {
  'use strict';

  var SESSION_KEY = 'zijie-profile-unlocked-v4';
  var LANGUAGE_KEY = 'zijie-profile-language';
  var language = 'en';
  var activeProfile = null;
  var publicContent = {};
  var publicSidebar = '';
  var openUnlockDialog;
  var PAYLOAD_URL = '/assets/data/profile.enc.json?v=1';
  var LINK_PAYLOAD_URL = '/assets/data/profile.link.enc.json?v=1';

  function translate(en, zh) { return language === 'zh' ? zh : en; }

  function renderLanguage() {
    var content = document.querySelector('.page__content');
    var sidebar = document.querySelector('.profile_box');
    if (!content || !sidebar) return false;
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    if (activeProfile) {
      content.innerHTML = language === 'zh' ? activeProfile.contentHtmlZh : activeProfile.contentHtml;
      sidebar.innerHTML = language === 'zh' ? activeProfile.sidebarHtmlZh : activeProfile.sidebarHtml;
    } else {
      content.innerHTML = publicContent[language];
      sidebar.innerHTML = publicSidebar;
      var name = sidebar.querySelector('.author__name');
      if (name && language === 'zh') name.textContent = '郭子杰（Zijie Guo）';
      attachHiddenEntrance(openUnlockDialog);
    }
    var labels = {
      'about-me': ['About Me', '关于我'], research: ['Research', '研究方向'],
      news: ['News', '最新动态'], publications: ['Publications', '论文发表'],
      experience: ['Experience', '研究与实习'], education: ['Education', '教育背景'],
      awards: ['Honors & Awards', '荣誉奖项'], skills: ['Skills', '技能']
    };
    document.querySelectorAll('#site-nav a').forEach(function (link) {
      var key = link.hash.slice(1);
      if (link.closest('.masthead__menu-home-item')) {
        link.textContent = translate('Homepage', '主页');
      } else if (labels[key]) {
        link.textContent = labels[key][language === 'zh' ? 1 : 0];
      }
    });
    var toggle = document.getElementById('language-toggle');
    if (toggle) {
      toggle.textContent = translate('中文', 'English');
      toggle.setAttribute('aria-label', translate('切换到中文', 'Switch to English'));
    }
    refreshImageLightbox();
    window.dispatchEvent(new Event('resize'));
    return true;
  }

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

  // main.min.js 里的 lightbox 初始化只在页面加载时跑一次，注入进来的图片链接需要重新绑定
  function refreshImageLightbox() {
    var $ = window.jQuery;
    if (!$ || !$.fn || !$.fn.magnificPopup) {
      return;
    }
    var links = $('.page__content a[href$=".png"], .page__content a[href$=".jpg"], ' +
      '.page__content a[href$=".jpeg"], .page__content a[href$=".gif"]');
    if (!links.length) {
      return;
    }
    links.addClass('image-popup').magnificPopup({
      type: 'image',
      tLoading: translate('Loading image #%curr%...', '正在加载图片 #%curr%…'),
      gallery: {
        enabled: true,
        navigateByImgClick: true,
        preload: [0, 1]
      },
      image: {
        tError: translate('<a href="%url%">Image #%curr%</a> could not be loaded.', '<a href="%url%">图片 #%curr%</a> 加载失败。')
      },
      removalDelay: 500,
      mainClass: 'mfp-zoom-in',
      closeOnContentClick: true,
      midClick: true
    });
  }

  function showFullProfile(profile) {
    var content = document.querySelector('.page__content');
    var sidebar = document.querySelector('.profile_box');
    if (!content || !sidebar) {
      return false;
    }

    if (!profile.contentHtmlZh || !profile.sidebarHtmlZh) return false;
    activeProfile = profile;
    document.documentElement.classList.remove('profile-locked');
    document.documentElement.classList.add('profile-unlocked');
    return renderLanguage();
  }

  function restoreSession() {
    try {
      var stored = window.sessionStorage.getItem(SESSION_KEY);
      if (!stored) {
        return false;
      }
      return showFullProfile(JSON.parse(stored));
    } catch (error) {
      try { window.sessionStorage.removeItem(SESSION_KEY); } catch (storageError) { /* Storage may be disabled. */ }
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
      overlay.querySelector('#profile-gate-title').textContent = translate('View full profile', '访问完整主页');
      dialog.querySelector('p').textContent = translate('Please enter the access password.', '请输入访问口令。');
      form.querySelector('label').textContent = translate('Access password', '访问口令');
      submit.textContent = translate('Unlock profile', '解锁主页');
      close.setAttribute('aria-label', translate('Close', '关闭'));
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
      message.textContent = translate('Verifying…', '正在验证…');

      try {
        var profile = await decryptProfile(input.value);
        try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(profile)); } catch (storageError) { /* Unlock also works without storage. */ }
        showFullProfile(profile);
        closeDialog();
      } catch (error) {
        message.textContent = error && error.message === 'payload'
          ? translate('Could not load the profile. Please try again later.', '暂时无法读取加密内容，请稍后重试。')
          : translate('Incorrect password. Please try again.', '口令不正确，请重新输入。');
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
    var content = document.querySelector('.page__content');
    var sidebar = document.querySelector('.profile_box');
    if (!content || !sidebar) return;
    var chinese = document.getElementById('profile-public-zh');
    publicContent.zh = chinese ? chinese.innerHTML : content.innerHTML;
    if (chinese) chinese.remove();
    publicContent.en = content.innerHTML;
    publicSidebar = sidebar.innerHTML;
    try { language = window.localStorage.getItem(LANGUAGE_KEY) === 'zh' ? 'zh' : 'en'; } catch (error) { /* Default to English. */ }
    openUnlockDialog = createUnlockDialog();
    renderLanguage();
    var toggle = document.getElementById('language-toggle');
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', function () {
        language = language === 'en' ? 'zh' : 'en';
        try { window.localStorage.setItem(LANGUAGE_KEY, language); } catch (error) { /* Switching works without storage. */ }
        renderLanguage();
      });
    }
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
        try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(linkedProfile)); } catch (storageError) { /* Optional cache. */ }
        showFullProfile(linkedProfile);
        clearPrivateLinkKey();
        return;
      } catch (error) {
        clearPrivateLinkKey();
      }
    }

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
}());
