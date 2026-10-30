<div dir="rtl" lang="he">

# כפתורי המשפחה: "נוסה", דירוג כוכבים ו"סנכרן עכשיו"

הכפתורים בדף המתכון ("סמנו כנוסה", הכוכבים) כותבים לתוך מסמך ה-Google Docs של המתכון ומפעילים סנכרון של האתר. אתר סטטי לא יכול לכתוב ל-Google Docs בעצמו, ולכן הכפתורים פותחים **Google Apps Script** קטן (הקוד: `apps-script/Code.gs`).

- הסקריפט רץ **בשם מי שלחץ** — כלומר רק מי שהתיקייה "מתכונים לאתר" משותפת איתו בהרשאת עריכה יכול לשנות משהו.
- הנתונים נשמרים במסמך עצמו, בטבלת הפרטים: שורה **נוסה** (כן/לא) ושורה **דירוג** (1–5). אפשר גם לכתוב אותן ידנית במסמך.
- את הסנכרון מפעיל טוקן GitHub שנשמר **בהגדרות הסקריפט בלבד**, לא באתר.

**זמן משוער:** כ-10 דקות, פעם אחת.

## שלב 1: טוקן GitHub (רק להפעלת הסנכרון)

1. https://github.com/settings/personal-access-tokens/new
2. **Token name:** `food-book-sync` · **Expiration:** שנה (או ללא תפוגה).
3. **Repository access:** Only select repositories ← `HaimW/shteingaus-food-book`.
4. **Permissions** ← Repository permissions ← **Actions: Read and write** (שום הרשאה אחרת).
5. **Generate token** ← מעתיקים את הטוקן (מתחיל ב-`github_pat_`). הוא מוצג פעם אחת בלבד.

## שלב 2: יצירת הסקריפט

1. https://script.google.com ← **New project** (עם החשבון שבו נמצאת התיקייה "מתכונים לאתר").
2. שם הפרויקט (למעלה): `ספר המתכונים`.
3. מוחקים את התוכן של `Code.gs` ומדביקים את כל התוכן של `apps-script/Code.gs` מהמאגר.
4. ⚙️ **Project Settings** ← מסמנים **Show "appsscript.json" manifest file in editor**. חוזרים לעורך, פותחים את `appsscript.json` ומחליפים את התוכן בתוכן של `apps-script/appsscript.json`.
5. ⚙️ **Project Settings** ← **Script Properties** ← **Add script property**: שם `GITHUB_TOKEN`, ערך = הטוקן משלב 1 ← **Save**.
6. שומרים (Ctrl+S).

## שלב 3: פרסום כאפליקציית ווב

1. **Deploy** ← **New deployment** ← גלגל השיניים ← **Web app**.
2. **Execute as:** User accessing the web app · **Who has access:** Anyone with Google account.
3. **Deploy** ← מאשרים את ההרשאות (Google תציג אזהרה "האפליקציה לא אומתה" — זה הסקריפט שלכם: Advanced ← Go to … ← Allow).
4. מעתיקים את **Web app URL** (מסתיים ב-`/exec`) ושולחים אותו — הוא נכנס לקובץ `src/lib/config.ts` (`APPS_SCRIPT_URL`), ואז הכפתורים מופיעים באתר.

בפעם הראשונה שכל בן משפחה לוחץ על כפתור, Google תבקש ממנו לאשר את ההרשאות פעם אחת.

## עדכון הקוד בעתיד

אחרי שינוי ב-`Code.gs`: **Deploy** ← **Manage deployments** ← עיפרון ← Version: **New version** ← **Deploy**. הכתובת נשארת אותה כתובת.

</div>
