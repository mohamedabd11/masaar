// ══════════════════════════════════════════════════════════
// auth.js — إدارة المصادقة وتسجيل الدخول والخروج
// ══════════════════════════════════════════════════════════

import {
  auth, db, COLL,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  collection, getDocs, doc, getDoc, setDoc
} from './firebase.js';

// ── يُعيّن من app.js عند التهيئة ──
let _onLoginSuccess = null;
let _onLogout       = null;
let _DEFAULT_PERMS  = null;

/**
 * تهيئة نظام المصادقة
 * @param {Function} onLoginSuccess  - دالة تُستدعى بعد نجاح الدخول مع بيانات المستخدم
 * @param {Function} onLogout        - دالة تُستدعى عند الخروج
 * @param {Object}   defaultPerms    - الصلاحيات الافتراضية لكل دور
 */
export function initAuth(onLoginSuccess, onLogout, defaultPerms) {
  _onLoginSuccess = onLoginSuccess;
  _onLogout       = onLogout;
  _DEFAULT_PERMS  = defaultPerms;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      await _handleAuthUser(user);
    } else {
      _onLogout();
    }
  });
}

/** معالجة المستخدم بعد تسجيل الدخول */
async function _handleAuthUser(user) {
  try {
    const userDoc = await getDoc(doc(db, COLL.USERS, user.uid));

    if (userDoc.exists()) {
      const data = userDoc.data();

      // حساب محذوف / معطّل
      if (data.deleted) {
        await signOut(auth);
        return;
      }

      const role  = data.role || 'custom';
      const pages = _getPagesForUser(data);
      const name  = data.displayName || user.email.split('@')[0];

      _onLoginSuccess({ user, role, pages, name });

    } else {
      // أول مستخدم يسجّل يصبح مديراً تلقائياً
      const allUsers = await getDocs(collection(db, COLL.USERS));
      const hasAdmin = allUsers.docs.some(d => d.data().role === 'admin');

      if (!hasAdmin) {
        await setDoc(doc(db, COLL.USERS, user.uid), {
          email:       user.email,
          displayName: user.email.split('@')[0],
          role:        'admin',
          customPages: _DEFAULT_PERMS.admin,
          createdAt:   new Date().toISOString()
        });
        _onLoginSuccess({
          user,
          role:  'admin',
          pages: _DEFAULT_PERMS.admin,
          name:  user.email.split('@')[0]
        });
      } else {
        // حساب غير مُسجَّل في قاعدة البيانات
        await signOut(auth);
        _showAuthError('حسابك غير مفعّل — تواصل مع مدير النظام');
      }
    }
  } catch (e) {
    console.error('[Auth] handleAuthUser error:', e);
    _onLogout();
  }
}

/** تحديد الصفحات المتاحة للمستخدم */
function _getPagesForUser(userData) {
  if (userData.role === 'admin') return _DEFAULT_PERMS.admin;
  if (userData.role === 'manager') {
    return (userData.customPages?.length) ? userData.customPages : (_DEFAULT_PERMS.manager || []);
  }
  if (userData.customPages && userData.customPages.length > 0) return userData.customPages;
  return _DEFAULT_PERMS[userData.role] || _DEFAULT_PERMS.editor;
}

/** إظهار رسالة خطأ في شاشة الدخول */
function _showAuthError(msg) {
  setTimeout(() => {
    const errEl = document.getElementById('auth-error');
    if (errEl) {
      errEl.textContent = msg;
      errEl.classList.add('show');
    }
  }, 300);
}

/** تسجيل الدخول */
export async function doLogin() {
  const emailEl = document.getElementById('auth-email');
  const passEl  = document.getElementById('auth-password');
  const errEl   = document.getElementById('auth-error');
  const btn     = document.getElementById('login-btn');

  const email = (emailEl?.value || '').trim().toLowerCase();
  const pass  = passEl?.value || '';

  errEl?.classList.remove('show');

  // التحقق من المدخلات
  if (!email || !pass) {
    if (errEl) { errEl.textContent = 'أدخل البريد الإلكتروني وكلمة المرور'; errEl.classList.add('show'); }
    return;
  }
  if (!email.includes('@')) {
    if (errEl) { errEl.textContent = 'البريد الإلكتروني غير صحيح'; errEl.classList.add('show'); }
    return;
  }

  if (btn) { btn.textContent = 'جاري الدخول...'; btn.disabled = true; }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged يتولى الباقي
  } catch (e) {
    if (btn) { btn.textContent = 'دخول'; btn.disabled = false; }
    if (passEl) passEl.value = '';
    const msg = e.code === 'auth/too-many-requests'
      ? 'تم تعطيل الحساب مؤقتاً لكثرة المحاولات'
      : 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    if (errEl) { errEl.textContent = msg; errEl.classList.add('show'); }
  }
}

/** تسجيل الخروج */
export async function doLogout(unsubCallback) {
  if (!confirm('هل تريد تسجيل الخروج؟')) return;
  if (typeof unsubCallback === 'function') unsubCallback();
  await signOut(auth);
}
