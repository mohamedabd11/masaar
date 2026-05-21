# خطوات تطبيق الأمان — مسار

## 1. تطبيق قواعد Firestore

انسخ محتوى `firestore.rules` إلى Firebase Console:

1. افتح https://console.firebase.google.com
2. اختر مشروع `ohdah-app-47826`
3. من القائمة الجانبية: **Firestore Database → Rules**
4. الصق محتوى `firestore.rules` واضغط **Publish**

**أو استخدم Firebase CLI:**
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

---

## 2. ماذا تحمي القواعد؟

| المجموعة   | القراءة                    | الكتابة          |
|------------|----------------------------|------------------|
| `entries`  | Admin: الكل — غيره: سجلاته فقط | Admin + Editor فقط |
| `users`    | المستخدم نفسه + Admin      | Admin فقط        |
| `settings` | جميع المستخدمين النشطين    | Admin فقط        |
| `shifts`   | جميع المستخدمين النشطين    | Admin فقط        |
| `auditLog` | Admin فقط                  | جميع النشطين (إضافة فقط) |

---

## 3. قواعد Hosting Headers

ملف `firebase.json` يضبط:
- `sw.js` يُرفض تخزينه كاش (لضمان التحديث الفوري)
- `index.html` مع `X-Frame-Options: SAMEORIGIN` لمنع Clickjacking
- `X-Content-Type-Options: nosniff` لمنع MIME sniffing
- ملفات JS/CSS مع كاش طويل للأداء

---

## 4. ملاحظات مهمة

- **مفاتيح Firebase في الكود طبيعية** لتطبيقات الويب — الحماية الحقيقية تأتي من قواعد Firestore
- **لا تضع في الكود** مفاتيح Firebase Admin SDK (server-side) — تلك سرية حقاً
- راجع دورياً `auditLog` لمراقبة الأنشطة غير الاعتيادية
