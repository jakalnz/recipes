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

## Nutrition
Nutrition is worked out per serving, per 100 g and for the whole recipe from published food composition data. Sources are used in this order:
1. **New Zealand FOODfiles 2024**, © The New Zealand Institute for Plant and Food Research Limited and the Ministry of Health
2. **Australian Food Composition Database, Release 3**, © Food Standards Australia New Zealand (CC BY 4.0)
3. **USDA FoodData Central, SR Legacy**, public domain. Its carbohydrate is by difference, so fibre is subtracted to match the NZ and AU "available carbohydrate" figures.

The source files are not in this repo. They live in `data-src/`, which git ignores. The merged table is stored in Firestore under `rxFoods`, readable by the family only. To rebuild it:
```
node scripts/build-foods.mjs "C:/New Zealand FOODfiles 2024"   # needs data-src/afcd and data-src/usda
node scripts/upload-foods.mjs          # or --emu for the emulator
node scripts/nutrition-report.mjs <export.paprikarecipes>   # check how lines are matched
```
`nutrition.js` reads each ingredient line, matches it to a food and converts the amount to grams. Common ingredients are matched to fixed foods; everything else goes through a keyword search. Grams come from cup and spoon weights, densities, or typical sizes. Anyone can correct a line in the app.
