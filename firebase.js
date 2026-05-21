// ══════════════════════════════════════════════════════════
// firebase.js — إعدادات Firebase والاتصال بقاعدة البيانات
// ══════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── إعادة تصدير دوال Firebase المستخدمة في باقي الملفات ──
export {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export {
  collection, addDoc, getDocs, doc, deleteDoc,
  updateDoc, query, onSnapshot, setDoc, getDoc, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── إعدادات المشروع ──
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAcG4GVkM2RjeQoFXCxiQrRUcdlYHSwKm8",
  authDomain:        "ohdah-app-47826.firebaseapp.com",
  projectId:         "ohdah-app-47826",
  storageBucket:     "ohdah-app-47826.firebasestorage.app",
  messagingSenderId: "244828328975",
  appId:             "1:244828328975:web:662f5eaabb819e0c507f7a"
};

// ── تهيئة Firebase ──
const firebaseApp = initializeApp(FIREBASE_CONFIG);
export const auth  = getAuth(firebaseApp);
export const db    = getFirestore(firebaseApp);

// ── تفعيل وضع العمل بدون إنترنت (Offline Persistence) ──
// Firebase تحتفظ بنسخة محلية وتزامن عند عودة الاتصال
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    // فتح تبويبات متعددة - الـ offline يعمل في تبويب واحد فقط
    console.info('[Firebase] Offline persistence: multiple tabs detected');
  } else if (err.code === 'unimplemented') {
    // المتصفح لا يدعم IndexedDB
    console.info('[Firebase] Offline persistence: not supported in this browser');
  }
});

// ── أسماء Collections في Firestore ──
export const COLL = {
  ENTRIES:   'entries',
  USERS:     'users',
  SETTINGS:  'settings',
  SHIFTS:    'shifts',
  AUDIT_LOG: 'auditLog',
};
