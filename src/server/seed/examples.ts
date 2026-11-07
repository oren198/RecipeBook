import type { RecipeInput } from "@/domain/recipe";

export const EXAMPLE_RECIPES: RecipeInput[] = [
  {
    title: "שקשוקה לדוגמה",
    intro: "מתכון הדגמה כללי, לא מתכון משפחתי. אפשר למחוק אותו אחרי שמכירים את הספר.",
    servings: 4,
    servingsText: "4 מנות",
    prepMinutes: 10,
    cookMinutes: 25,
    category: "דוגמה",
    tags: ["דוגמה", "מחבת"],
    notes: "זהו נתון לדוגמה בלבד.",
    sourceName: "נתוני דוגמה",
    sourceUrl: null,
    ingredientGroups: [
      {
        title: null,
        items: [
          { amount: 4, amountMax: null, unit: null, item: "ביצים", note: null, optional: false },
          { amount: 4, amountMax: null, unit: null, item: "עגבניות בשלות", note: "קצוצות", optional: false },
          { amount: 1, amountMax: null, unit: null, item: "פלפל אדום", note: null, optional: false },
          { amount: 2, amountMax: null, unit: "כפות", item: "שמן", note: null, optional: false },
          { amount: null, amountMax: null, unit: null, item: "מלח ופלפל", note: null, optional: false },
        ],
      },
    ],
    instructionGroups: [
      {
        title: null,
        steps: [
          { text: "מטגנים את הפלפל בשמן עד שהוא מתרכך." },
          { text: "מוסיפים את העגבניות ומבשלים לרוטב סמיך." },
          { text: "יוצרים גומות, שוברים פנימה את הביצים ומכסים עד שהחלבון מתייצב." },
        ],
      },
    ],
  },
  {
    title: "סלט ירקות לדוגמה",
    intro: "עוד מתכון הדגמה, כדי לראות פרק, חיפוש וקבוצות רכיבים.",
    servings: 6,
    servingsText: "6 מנות",
    prepMinutes: 15,
    cookMinutes: null,
    category: "דוגמה",
    tags: ["דוגמה", "קר"],
    notes: null,
    sourceName: "נתוני דוגמה",
    sourceUrl: null,
    ingredientGroups: [
      {
        title: "ירקות",
        items: [
          { amount: 3, amountMax: null, unit: null, item: "עגבניות", note: null, optional: false },
          { amount: 2, amountMax: null, unit: null, item: "מלפפונים", note: null, optional: false },
          { amount: 1, amountMax: null, unit: null, item: "בצל סגול", note: null, optional: true },
        ],
      },
      {
        title: "תיבול",
        items: [
          { amount: 2, amountMax: null, unit: "כפות", item: "שמן זית", note: null, optional: false },
          { amount: 1, amountMax: null, unit: "כף", item: "מיץ לימון", note: null, optional: false },
        ],
      },
    ],
    instructionGroups: [
      {
        title: null,
        steps: [
          { text: "קוצצים את הירקות לקוביות קטנות." },
          { text: "מערבבים עם שמן, לימון, מלח ופלפל ואוכלים מיד." },
        ],
      },
    ],
  },
  {
    title: "עוגת תפוחים לדוגמה",
    intro: "מתכון הדגמה עם זמן אפייה וקבוצת הוראות. אין כאן סיפור משפחתי אמיתי.",
    servings: null,
    servingsText: "תבנית אחת",
    prepMinutes: 20,
    cookMinutes: 45,
    category: "דוגמה",
    tags: ["דוגמה", "אפייה"],
    notes: "הכמות «תבנית אחת» שמורה כטקסט כי אין מספר מנות חד-משמעי.",
    sourceName: "נתוני דוגמה",
    sourceUrl: null,
    ingredientGroups: [
      {
        title: "בלילה",
        items: [
          { amount: 2, amountMax: null, unit: null, item: "ביצים", note: null, optional: false },
          { amount: 1, amountMax: null, unit: "כוס", item: "סוכר", note: null, optional: false },
          { amount: 1, amountMax: null, unit: "כוס", item: "קמח", note: null, optional: false },
        ],
      },
      {
        title: "תוספת",
        items: [{ amount: 2, amountMax: null, unit: null, item: "תפוחים", note: "פרוסים", optional: false }],
      },
    ],
    instructionGroups: [
      {
        title: "בלילה",
        steps: [{ text: "טורפים ביצים וסוכר, ואז מקפלים פנימה את הקמח." }],
      },
      {
        title: "אפייה",
        steps: [
          { text: "יוצקים לתבנית, מסדרים מעל תפוחים ואופים עד שהבלילה יציבה." },
          { text: "מצננים לפני החיתוך." },
        ],
      },
    ],
  },
];
