# Family Recipes

A family recipe book and meal planner. It's a no-build PWA on GitHub Pages, and it shares the Firebase project with [Shop](https://github.com/jakalnz/shop).

## What's here now
- **Sign-in and access:** Google sign-in, with access limited to the family list in Firestore at `access/family`.
- **Households:** settings for households and who can use the app. These are only shown to the Shop accounts.
- **People and dietary needs:** each person can have presets (Coeliac, Diabetic, After Whipple / Creon, Lactose intolerant, Vegetarian, Vegan, and allergens), plus their own foods to avoid.
- **Recipe book:** add, view, edit and delete recipes, with a dietary check for your household or the whole family.

Still to come: import from links and photos, unit conversion, the meal planner and family meals, Send to Shop, and nutrition.

## Data and security
- Shop's collections (`items`, `stores`, `trips`, `presence`, `meta`, `photos`) are open only to the accounts listed in `access/family.shop`.
- Recipe data lives in collections whose names start with `rx`. These are open to everyone in `access/family.members`.
- Meal plans are private to each household.
- [`firestore.rules`](firestore.rules) applies to both apps. Run the rules tests before every deploy:

```
npm install
npm run test:rules        # needs Java 21
npm test                  # unit tests
firebase deploy --only firestore:rules
```

## Trying it locally without touching live data
```
npm run emu               # Firestore and Auth emulators
npm run seed              # adds a pretend family
npm run serve             # http://localhost:5173/?emu
```
In the browser console, run `__emuSignIn('shop.one@example.com')` (the admin) or `__emuSignIn('aunt.test@example.com')` (another household).

The dietary check is a keyword match to help spot ingredients. It isn't medical advice.
