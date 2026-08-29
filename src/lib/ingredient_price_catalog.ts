/**
 * Ingredient-level US-baseline price catalog.
 *
 * Purpose
 * -------
 * Recipe rows carry per-ingredient `est_price` values (hand-authored on seed
 * recipes, Gemini-guessed on AI ones). Those numbers are the source of truth
 * for a given recipe — they capture "this specific pizza uses 4oz of goat
 * cheese for $2.50", not "goat cheese costs $10/lb everywhere". Prices vary
 * by store, region, and preparation.
 *
 * This catalog complements — does not replace — those recipe est_prices. It
 * provides:
 *   1. A canonical fallback for ingredients that arrive with no price (rare
 *      but possible with future generation paths). `resolveBaselinePrice`
 *      returns null if we don't know.
 *   2. A sanity band for the validator to reject hallucinated prices — same
 *      belt-and-suspenders pattern as the nutrition cross-check.
 *
 * Values are US-average retail prices in USD, from public grocery-basket
 * surveys (BLS Average Price series, Instacart price snapshots) as of
 * 2026-Q1. Deliberately coarse — a $0.05 miss won't matter; a $5 miss will.
 *
 * The country cost multiplier (`priceLocalPerUsd` in country_data.ts) is
 * still applied on top for any downstream display — the catalog stays in
 * canonical USD.
 */

export interface UsBaselinePrice {
  /** Canonical ingredient key. Matches the nutrition catalog where possible. */
  key: string;
  /**
   * Canonical unit. When a recipe uses a different unit for the same
   * ingredient, `resolveBaselinePrice` converts before pricing.
   */
  unit: string;
  /** US-average retail price per `unit`, in USD. */
  usd: number;
  /** Alias keywords the matcher checks (case-insensitive substring). */
  aliases: string[];
  /**
   * Additional per-unit prices for the same ingredient — used when a recipe
   * writes "2 tbsp almonds" but the primary entry is in oz (mass↔volume
   * can't auto-convert without a per-item density). The resolver tries these
   * as a fallback when the primary unit fails to convert.
   */
  alternates?: Array<{ unit: string; usd: number }>;
  /** Optional: broad category, useful for aggregation / debugging. */
  category?:
    | 'produce'
    | 'meat'
    | 'seafood'
    | 'dairy'
    | 'eggs'
    | 'grains'
    | 'legumes'
    | 'nuts'
    | 'oils'
    | 'condiments'
    | 'spices'
    | 'bakery'
    | 'pantry'
    | 'beverages'
    | 'canned';
}

// ─── Catalog ─────────────────────────────────────────────────────────────
// Every entry seeded from the seed-recipe median est_price × unit (see
// `supabase/seed/recipes.ts`), rounded to a clean number and extended with
// values Gemini commonly quotes.

const PRICES: UsBaselinePrice[] = [
  // ── Proteins: poultry / meat ─────────────────────────────────────────
  { key: 'chicken breast',      unit: 'lb', usd: 6.50, aliases: ['chicken breast', 'boneless chicken'], category: 'meat' },
  { key: 'chicken thighs',      unit: 'lb', usd: 8.00, aliases: ['chicken thigh', 'chicken thighs'],    category: 'meat' },
  { key: 'ground turkey 93/7',  unit: 'lb', usd: 6.50, aliases: ['ground turkey', '93/7 turkey'],       category: 'meat' },
  { key: 'ground beef 85/15',   unit: 'lb', usd: 7.50, aliases: ['ground beef', '85/15 beef', 'lean ground beef'], category: 'meat' },
  { key: 'ground beef 90/10',   unit: 'lb', usd: 8.50, aliases: ['90/10 beef', 'lean ground beef 90'],  category: 'meat' },
  { key: 'flank steak',         unit: 'lb', usd: 10.00, aliases: ['flank steak', 'flank', 'lean flank steak'], category: 'meat' },
  { key: 'pork tenderloin',     unit: 'lb', usd: 8.00, aliases: ['pork tenderloin', 'pork loin'], category: 'meat' },
  { key: 'pork chop',           unit: 'lb', usd: 6.50, aliases: ['pork chop', 'pork chops'],     category: 'meat' },
  { key: 'bacon',               unit: 'lb', usd: 8.00, aliases: ['bacon', 'bacon strips'],       category: 'meat', alternates: [{ unit: 'slice', usd: 0.50 }, { unit: 'strip', usd: 0.50 }] },
  { key: 'ham',                 unit: 'lb', usd: 7.00, aliases: ['ham', 'deli ham'],             category: 'meat', alternates: [{ unit: 'slice', usd: 0.35 }] },
  { key: 'prosciutto',          unit: 'oz', usd: 3.50, aliases: ['prosciutto'],                  category: 'meat', alternates: [{ unit: 'slice', usd: 1.05 }] },
  { key: 'lamb',                unit: 'lb', usd: 12.00, aliases: ['lamb', 'ground lamb'],        category: 'meat' },
  // turkey breakfast sausage consolidated below with correct per-link price + oz alt.
  { key: 'chorizo',             unit: 'lb', usd: 8.00, aliases: ['chorizo'],                     category: 'meat' },
  { key: 'pepperoni',           unit: 'oz', usd: 0.80, aliases: ['pepperoni'],                   category: 'meat', alternates: [{ unit: 'slice', usd: 0.06 }] },

  // ── Proteins: fish / seafood ─────────────────────────────────────────
  { key: 'salmon fillet',       unit: 'lb', usd: 12.00, aliases: ['salmon', 'sushi-grade salmon', 'salmon fillet'], category: 'seafood' },
  { key: 'smoked salmon',       unit: 'oz', usd: 3.00, aliases: ['smoked salmon', 'lox'],        category: 'seafood' },
  { key: 'cod fillet',          unit: 'lb', usd: 9.00, aliases: ['cod', 'cod fillet'],           category: 'seafood' },
  { key: 'shrimp',              unit: 'lb', usd: 9.00, aliases: ['shrimp', 'prawn', 'prawns'],   category: 'seafood' },
  { key: 'canned tuna',         unit: 'can', usd: 3.00, aliases: ['tuna', 'canned tuna', 'tuna in water'], category: 'seafood', alternates: [{ unit: 'oz', usd: 0.60 }] },
  { key: 'sardines',            unit: 'can', usd: 2.50, aliases: ['sardines', 'sardine'],        category: 'seafood' },
  { key: 'mackerel (fresh lb)', unit: 'lb', usd: 6.00, aliases: ['fresh mackerel'],              category: 'seafood' },
  { key: 'halibut',             unit: 'lb', usd: 22.00, aliases: ['halibut'],                    category: 'seafood' },
  { key: 'trout',               unit: 'lb', usd: 10.00, aliases: ['trout', 'rainbow trout'],     category: 'seafood' },
  { key: 'tilapia',             unit: 'lb', usd: 5.00, aliases: ['tilapia'],                     category: 'seafood' },
  { key: 'scallops',            unit: 'lb', usd: 20.00, aliases: ['scallop', 'scallops'],        category: 'seafood' },
  { key: 'mussels',             unit: 'lb', usd: 5.00, aliases: ['mussels', 'mussel'],           category: 'seafood' },
  { key: 'crab meat',           unit: 'lb', usd: 20.00, aliases: ['crab', 'crab meat'],          category: 'seafood' },

  // ── Proteins: plant-based ────────────────────────────────────────────
  { key: 'extra-firm tofu',     unit: 'oz', usd: 0.30, aliases: ['tofu', 'firm tofu', 'extra firm tofu'], category: 'meat', alternates: [{ unit: 'block', usd: 4.50 }, { unit: 'lb', usd: 4.80 }, { unit: 'cup', usd: 2.40 }] },
  { key: 'tempeh',              unit: 'oz', usd: 0.50, aliases: ['tempeh'],                      category: 'meat', alternates: [{ unit: 'block', usd: 4.00 }, { unit: 'cup', usd: 4.00 }] },
  { key: 'edamame',             unit: 'cup', usd: 1.50, aliases: ['edamame'],                    category: 'produce', alternates: [{ unit: 'bag', usd: 4.00 }, { unit: 'oz', usd: 0.30 }] },
  { key: 'seitan',              unit: 'oz', usd: 0.50, aliases: ['seitan', 'wheat gluten'],      category: 'meat', alternates: [{ unit: 'cup', usd: 4.00 }, { unit: 'lb', usd: 8.00 }] },

  // ── Legumes (canned + dry) ───────────────────────────────────────────
  { key: 'black beans',         unit: 'can', usd: 1.10, aliases: ['black beans', 'black bean'],  category: 'legumes', alternates: [{ unit: 'cup', usd: 0.73 }, { unit: 'oz', usd: 0.09 }] },
  { key: 'chickpeas',           unit: 'can', usd: 1.10, aliases: ['chickpeas', 'garbanzo'],      category: 'legumes', alternates: [{ unit: 'cup', usd: 0.73 }, { unit: 'oz', usd: 0.09 }] },
  { key: 'cannellini beans',    unit: 'can', usd: 1.80, aliases: ['cannellini', 'white beans'],  category: 'legumes', alternates: [{ unit: 'cup', usd: 1.20 }, { unit: 'oz', usd: 0.15 }] },
  { key: 'kidney beans',        unit: 'can', usd: 1.20, aliases: ['kidney beans', 'red beans'],  category: 'legumes', alternates: [{ unit: 'cup', usd: 0.80 }, { unit: 'oz', usd: 0.10 }] },
  { key: 'pinto beans',         unit: 'can', usd: 1.20, aliases: ['pinto beans'],                category: 'legumes', alternates: [{ unit: 'cup', usd: 0.80 }, { unit: 'oz', usd: 0.10 }] },
  { key: 'navy beans',          unit: 'can', usd: 1.30, aliases: ['navy beans', 'haricot'],      category: 'legumes', alternates: [{ unit: 'cup', usd: 0.87 }, { unit: 'oz', usd: 0.11 }] },
  { key: 'lima beans',          unit: 'can', usd: 1.30, aliases: ['lima beans', 'butter beans'], category: 'legumes', alternates: [{ unit: 'cup', usd: 0.87 }, { unit: 'oz', usd: 0.11 }] },
  { key: 'red lentils',         unit: 'cup', usd: 1.80, aliases: ['lentils', 'red lentils', 'green lentils'], category: 'legumes', alternates: [{ unit: 'oz', usd: 0.25 }, { unit: 'lb', usd: 4.00 }] },
  { key: 'split peas',          unit: 'cup', usd: 1.50, aliases: ['split peas'],                 category: 'legumes', alternates: [{ unit: 'oz', usd: 0.20 }, { unit: 'lb', usd: 3.20 }] },

  // ── Grains ───────────────────────────────────────────────────────────
  { key: 'rolled oats',         unit: 'cup', usd: 0.35, aliases: ['oats', 'rolled oats', 'oatmeal', 'porridge oats'], category: 'grains' },
  { key: 'quinoa',              unit: 'cup', usd: 1.80, aliases: ['quinoa'],                     category: 'grains' },
  { key: 'brown rice',          unit: 'cup', usd: 1.20, aliases: ['brown rice'],                 category: 'grains' },
  { key: 'basmati rice',        unit: 'cup', usd: 1.00, aliases: ['basmati', 'basmati rice', 'white rice'], category: 'grains' },
  { key: 'jasmine rice',        unit: 'cup', usd: 1.00, aliases: ['jasmine rice'],               category: 'grains' },
  { key: 'wild rice',           unit: 'cup', usd: 2.50, aliases: ['wild rice'],                  category: 'grains' },
  { key: 'farro',               unit: 'cup', usd: 1.50, aliases: ['farro', 'emmer'],             category: 'grains' },
  { key: 'barley',              unit: 'cup', usd: 1.00, aliases: ['barley', 'pearl barley'],     category: 'grains' },
  { key: 'bulgur',              unit: 'cup', usd: 1.00, aliases: ['bulgur', 'bulgar wheat'],     category: 'grains' },
  { key: 'couscous',            unit: 'cup', usd: 1.20, aliases: ['couscous'],                   category: 'grains' },
  { key: 'whole wheat pasta',   unit: 'oz', usd: 0.20, aliases: ['whole wheat pasta', 'whole-wheat pasta'], category: 'grains' },
  { key: 'spaghetti',           unit: 'oz', usd: 0.15, aliases: ['spaghetti', 'linguine', 'fettuccine'], category: 'grains' },
  { key: 'penne',               unit: 'oz', usd: 0.15, aliases: ['penne', 'rigatoni', 'ziti', 'pasta'], category: 'grains' },
  { key: 'rice noodles',        unit: 'oz', usd: 0.30, aliases: ['rice noodles'],                category: 'grains' },
  { key: 'udon',                unit: 'oz', usd: 0.35, aliases: ['udon', 'udon noodles'],        category: 'grains' },
  { key: 'soba',                unit: 'oz', usd: 0.45, aliases: ['soba', 'soba noodles'],        category: 'grains' },

  // ── Bakery ───────────────────────────────────────────────────────────
  { key: 'whole-grain bread',   unit: 'slice', usd: 0.35, aliases: ['whole-grain bread', 'whole wheat bread', 'whole grain bread', 'bread'], category: 'bakery', alternates: [{ unit: 'loaf', usd: 5.50 }, { unit: 'oz', usd: 0.20 }] },
  { key: 'sourdough bread',     unit: 'slice', usd: 0.50, aliases: ['sourdough', 'sourdough bread'], category: 'bakery', alternates: [{ unit: 'loaf', usd: 7.00 }, { unit: 'oz', usd: 0.25 }] },
  { key: 'whole-grain tortilla', unit: 'each', usd: 0.50, aliases: ['tortilla', 'whole-grain tortilla', 'whole wheat tortilla'], category: 'bakery', alternates: [{ unit: 'pack', usd: 4.00 }] },
  { key: 'whole-grain bagel thin', unit: 'each', usd: 0.75, aliases: ['bagel thin', 'whole-grain bagel', 'bagel'], category: 'bakery', alternates: [{ unit: 'pack', usd: 4.50 }] },
  { key: 'pita bread',          unit: 'each', usd: 0.60, aliases: ['pita', 'pita bread'],        category: 'bakery', alternates: [{ unit: 'pack', usd: 3.60 }] },
  { key: 'naan',                unit: 'each', usd: 1.20, aliases: ['naan'],                      category: 'bakery', alternates: [{ unit: 'pack', usd: 4.80 }] },

  // ── Dairy + eggs ─────────────────────────────────────────────────────
  { key: 'egg',                 unit: 'each', usd: 0.40, aliases: ['egg', 'eggs', 'whole egg'],  category: 'eggs', alternates: [{ unit: 'dozen', usd: 4.80 }, { unit: 'large', usd: 0.40 }] },
  { key: 'greek yogurt 2%',     unit: 'cup', usd: 1.60, aliases: ['greek yogurt', 'greek yogurt 2%', 'plain greek yogurt', 'yogurt'], category: 'dairy' },
  { key: 'cottage cheese 2%',   unit: 'cup', usd: 1.30, aliases: ['cottage cheese'],             category: 'dairy' },
  { key: 'feta cheese',         unit: 'oz', usd: 0.75, aliases: ['feta', 'feta cheese'],         category: 'dairy', alternates: [{ unit: 'tbsp', usd: 0.38 }, { unit: 'cup', usd: 4.00 }] },
  { key: 'parmesan cheese',     unit: 'oz', usd: 1.20, aliases: ['parmesan', 'parmigiano'],      category: 'dairy', alternates: [{ unit: 'tbsp', usd: 0.22 }, { unit: 'cup', usd: 3.50 }] },
  { key: 'mozzarella',          unit: 'oz', usd: 0.60, aliases: ['mozzarella', 'mozzarella cheese', 'fresh mozzarella'], category: 'dairy', alternates: [{ unit: 'tbsp', usd: 0.30 }, { unit: 'cup', usd: 2.40 }] },
  { key: 'cheddar',             unit: 'oz', usd: 0.55, aliases: ['cheddar'],                     category: 'dairy', alternates: [{ unit: 'tbsp', usd: 0.28 }, { unit: 'cup', usd: 2.20 }] },
  { key: 'cream cheese',        unit: 'oz', usd: 0.45, aliases: ['cream cheese'],                category: 'dairy', alternates: [{ unit: 'tbsp', usd: 0.24 }, { unit: 'cup', usd: 3.85 }] },
  { key: 'ricotta',             unit: 'cup', usd: 3.00, aliases: ['ricotta'],                    category: 'dairy', alternates: [{ unit: 'tbsp', usd: 0.19 }, { unit: 'oz', usd: 0.35 }] },
  // goat cheese consolidated below; entry retained placeholder here removed.
  { key: 'blue cheese',         unit: 'oz', usd: 1.10, aliases: ['blue cheese', 'gorgonzola'],   category: 'dairy', alternates: [{ unit: 'tbsp', usd: 0.55 }, { unit: 'cup', usd: 4.40 }] },
  // swiss cheese consolidated below (with gruyere as its own entry).
  { key: 'milk',                unit: 'cup', usd: 0.35, aliases: ['milk', 'milk 2%', '2% milk', 'whole milk', 'skim milk'], category: 'dairy' },
  { key: 'buttermilk',          unit: 'cup', usd: 0.60, aliases: ['buttermilk'],                 category: 'dairy' },
  { key: 'heavy cream',         unit: 'cup', usd: 2.50, aliases: ['heavy cream', 'heavy whipping cream'], category: 'dairy' },
  { key: 'sour cream',          unit: 'cup', usd: 2.00, aliases: ['sour cream'],                 category: 'dairy' },
  { key: 'butter',              unit: 'tbsp', usd: 0.15, aliases: ['butter'],                    category: 'dairy' },
  { key: 'ghee',                unit: 'tbsp', usd: 0.30, aliases: ['ghee', 'clarified butter'],  category: 'dairy' },
  { key: 'unsweetened almond milk', unit: 'cup', usd: 0.80, aliases: ['almond milk', 'unsweetened almond milk'], category: 'dairy' },
  { key: 'oat milk',            unit: 'cup', usd: 1.00, aliases: ['oat milk'],                   category: 'dairy' },
  { key: 'soy milk',            unit: 'cup', usd: 0.80, aliases: ['soy milk'],                   category: 'dairy' },
  { key: 'light coconut milk',  unit: 'can', usd: 2.50, aliases: ['coconut milk', 'light coconut milk'], category: 'dairy', alternates: [{ unit: 'cup', usd: 1.43 }, { unit: 'tbsp', usd: 0.09 }] },
  { key: 'vanilla whey protein', unit: 'scoop', usd: 1.00, aliases: ['whey protein', 'protein powder', 'vanilla whey'], category: 'pantry', alternates: [{ unit: 'tbsp', usd: 0.50 }, { unit: 'g', usd: 0.03 }] },

  // ── Vegetables ───────────────────────────────────────────────────────
  { key: 'baby spinach',        unit: 'cup', usd: 1.50, aliases: ['spinach', 'baby spinach'],    category: 'produce' },
  { key: 'butter lettuce',      unit: 'head', usd: 2.50, aliases: ['butter lettuce', 'boston lettuce', 'bibb lettuce', 'lettuce'], category: 'produce', alternates: [{ unit: 'leaf', usd: 0.25 }, { unit: 'cup', usd: 0.50 }] },
  { key: 'kale',                unit: 'bunch', usd: 2.50, aliases: ['kale', 'baby kale'],        category: 'produce', alternates: [{ unit: 'cup', usd: 0.42 }, { unit: 'lb', usd: 2.50 }, { unit: 'oz', usd: 0.16 }] },
  { key: 'arugula',             unit: 'cup', usd: 1.75, aliases: ['arugula', 'rocket'],          category: 'produce', alternates: [{ unit: 'oz', usd: 0.90 }] },
  { key: 'swiss chard',         unit: 'bunch', usd: 2.50, aliases: ['swiss chard', 'chard'],     category: 'produce', alternates: [{ unit: 'cup', usd: 0.42 }, { unit: 'lb', usd: 3.00 }] },
  { key: 'collard greens',      unit: 'bunch', usd: 2.50, aliases: ['collard greens', 'collards'], category: 'produce', alternates: [{ unit: 'cup', usd: 0.42 }, { unit: 'lb', usd: 3.00 }] },
  { key: 'coleslaw mix',        unit: 'bag', usd: 2.00, aliases: ['coleslaw', 'coleslaw mix'],   category: 'produce', alternates: [{ unit: 'cup', usd: 0.33 }, { unit: 'oz', usd: 0.15 }] },
  { key: 'cabbage',             unit: 'head', usd: 3.00, aliases: ['cabbage'],                   category: 'produce', alternates: [{ unit: 'cup', usd: 0.40 }, { unit: 'lb', usd: 1.00 }] },
  { key: 'broccoli',            unit: 'head', usd: 2.50, aliases: ['broccoli'],                  category: 'produce', alternates: [{ unit: 'cup', usd: 0.50 }, { unit: 'lb', usd: 2.50 }, { unit: 'oz', usd: 0.16 }] },
  { key: 'brussels sprouts',    unit: 'lb', usd: 4.00, aliases: ['brussels sprouts', 'brussel sprouts'], category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'each', usd: 0.20 }] },
  { key: 'cauliflower',         unit: 'head', usd: 3.50, aliases: ['cauliflower'],               category: 'produce', alternates: [{ unit: 'cup', usd: 0.60 }, { unit: 'lb', usd: 1.75 }] },
  { key: 'riced cauliflower',   unit: 'cup', usd: 3.00, aliases: ['riced cauliflower'],          category: 'produce' },
  { key: 'bok choy',            unit: 'head', usd: 2.00, aliases: ['bok choy', 'pak choi'],      category: 'produce', alternates: [{ unit: 'cup', usd: 0.50 }, { unit: 'lb', usd: 3.50 }] },
  { key: 'asparagus',           unit: 'bunch', usd: 3.00, aliases: ['asparagus'],                category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'lb', usd: 4.00 }, { unit: 'spear', usd: 0.15 }] },
  { key: 'zucchini',            unit: 'each', usd: 1.50, aliases: ['zucchini', 'courgette'],     category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'lb', usd: 3.00 }] },
  { key: 'eggplant',            unit: 'each', usd: 2.50, aliases: ['eggplant', 'aubergine'],     category: 'produce', alternates: [{ unit: 'cup', usd: 0.83 }, { unit: 'lb', usd: 2.50 }] },
  { key: 'sweet potato',        unit: 'each', usd: 2.00, aliases: ['sweet potato', 'yam'],       category: 'produce', alternates: [{ unit: 'cup', usd: 1.33 }, { unit: 'lb', usd: 2.50 }] },
  { key: 'potato',              unit: 'lb', usd: 1.50, aliases: ['potato', 'potatoes', 'russet', 'yukon gold'], category: 'produce', alternates: [{ unit: 'each', usd: 0.60 }, { unit: 'cup', usd: 1.00 }] },
  { key: 'carrot',              unit: 'each', usd: 0.30, aliases: ['carrot', 'carrots'],         category: 'produce', alternates: [{ unit: 'cup', usd: 0.60 }, { unit: 'lb', usd: 1.50 }] },
  { key: 'celery',              unit: 'stalk', usd: 0.40, aliases: ['celery'],                   category: 'produce', alternates: [{ unit: 'cup', usd: 0.80 }, { unit: 'bunch', usd: 3.00 }] },
  { key: 'cucumber',            unit: 'each', usd: 0.50, aliases: ['cucumber'],                  category: 'produce', alternates: [{ unit: 'cup', usd: 0.50 }, { unit: 'slice', usd: 0.02 }] },
  { key: 'bell pepper',         unit: 'each', usd: 1.00, aliases: ['bell pepper', 'red pepper', 'green pepper', 'yellow pepper', 'capsicum'], category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'tbsp', usd: 0.06 }] },
  { key: 'cherry tomatoes',     unit: 'cup', usd: 2.00, aliases: ['cherry tomato', 'grape tomatoes'], category: 'produce', alternates: [{ unit: 'pint', usd: 4.00 }, { unit: 'oz', usd: 0.40 }, { unit: 'each', usd: 0.10 }] },
  { key: 'tomato',              unit: 'each', usd: 1.00, aliases: ['tomato', 'roma tomato'],     category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'lb', usd: 3.00 }, { unit: 'slice', usd: 0.15 }] },
  { key: 'diced tomatoes',      unit: 'can', usd: 1.20, aliases: ['diced tomatoes', 'canned tomatoes'], category: 'canned', alternates: [{ unit: 'cup', usd: 0.70 }, { unit: 'oz', usd: 0.08 }] },
  { key: 'red onion',           unit: 'each', usd: 0.60, aliases: ['red onion', 'onion', 'yellow onion', 'white onion'], category: 'produce', alternates: [{ unit: 'cup', usd: 0.60 }, { unit: 'lb', usd: 1.50 }, { unit: 'tbsp', usd: 0.04 }] },
  { key: 'green onion',         unit: 'each', usd: 0.30, aliases: ['green onion', 'scallion', 'scallions', 'spring onion'], category: 'produce', alternates: [{ unit: 'bunch', usd: 1.50 }, { unit: 'cup', usd: 0.50 }, { unit: 'tbsp', usd: 0.05 }] },
  { key: 'leek',                unit: 'each', usd: 1.50, aliases: ['leek', 'leeks'],             category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }] },
  { key: 'shallot',             unit: 'each', usd: 0.75, aliases: ['shallot', 'shallots'],       category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.15 }, { unit: 'cup', usd: 2.50 }] },
  { key: 'garlic',              unit: 'clove', usd: 0.10, aliases: ['garlic'],                   category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.20 }, { unit: 'tsp', usd: 0.07 }, { unit: 'head', usd: 0.80 }] },
  { key: 'ginger',              unit: 'tbsp', usd: 0.30, aliases: ['ginger'],                    category: 'produce', alternates: [{ unit: 'tsp', usd: 0.10 }, { unit: 'oz', usd: 0.60 }, { unit: 'inch', usd: 0.40 }] },
  { key: 'mushrooms',           unit: 'oz', usd: 0.35, aliases: ['mushroom', 'button mushroom', 'cremini', 'shiitake', 'portobello'], category: 'produce', alternates: [{ unit: 'each', usd: 1.40 }, { unit: 'cup', usd: 1.80 }] },
  { key: 'green beans',         unit: 'lb', usd: 2.50, aliases: ['green beans', 'string beans'], category: 'produce', alternates: [{ unit: 'cup', usd: 1.10 }, { unit: 'oz', usd: 0.20 }] },
  { key: 'snap peas',           unit: 'cup', usd: 3.00, aliases: ['snap peas', 'snow peas', 'sugar snap peas'], category: 'produce' },
  { key: 'peas',                unit: 'cup', usd: 1.20, aliases: ['peas', 'green peas'], category: 'produce' },
  { key: 'peas & carrots',      unit: 'cup', usd: 1.20, aliases: ['peas carrots', 'peas and carrots'], category: 'produce' },
  { key: 'corn',                unit: 'cup', usd: 1.00, aliases: ['corn', 'sweet corn'],         category: 'produce' },
  { key: 'water chestnuts',     unit: 'can', usd: 1.20, aliases: ['water chestnuts'],            category: 'canned', alternates: [{ unit: 'cup', usd: 1.20 }, { unit: 'oz', usd: 0.15 }] },
  { key: 'artichoke hearts',    unit: 'can', usd: 3.00, aliases: ['artichoke', 'artichoke hearts'], category: 'canned', alternates: [{ unit: 'cup', usd: 2.00 }, { unit: 'oz', usd: 0.25 }] },
  { key: 'butternut squash',    unit: 'each', usd: 4.00, aliases: ['butternut squash', 'butternut'], category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'lb', usd: 1.33 }] },
  { key: 'radish',              unit: 'bunch', usd: 1.50, aliases: ['radish', 'radishes', 'daikon'], category: 'produce', alternates: [{ unit: 'cup', usd: 0.75 }, { unit: 'each', usd: 0.10 }] },
  { key: 'beet',                unit: 'each', usd: 1.00, aliases: ['beet', 'beets', 'beetroot'], category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'lb', usd: 2.00 }] },
  { key: 'fennel',              unit: 'each', usd: 3.00, aliases: ['fennel', 'fennel bulb'],     category: 'produce', alternates: [{ unit: 'cup', usd: 1.50 }, { unit: 'bulb', usd: 3.00 }] },

  // ── Fruit ────────────────────────────────────────────────────────────
  { key: 'apple',               unit: 'each', usd: 0.60, aliases: ['apple', 'apples'],           category: 'produce', alternates: [{ unit: 'cup', usd: 0.60 }, { unit: 'lb', usd: 2.00 }, { unit: 'slice', usd: 0.10 }] },
  { key: 'banana',              unit: 'each', usd: 0.30, aliases: ['banana', 'bananas'],         category: 'produce', alternates: [{ unit: 'cup', usd: 0.30 }, { unit: 'lb', usd: 0.60 }, { unit: 'slice', usd: 0.01 }] },
  { key: 'blueberries',         unit: 'cup', usd: 3.00, aliases: ['blueberries', 'blueberry'],   category: 'produce', alternates: [{ unit: 'oz', usd: 0.60 }, { unit: 'pint', usd: 5.00 }, { unit: 'lb', usd: 9.60 }] },
  { key: 'raspberries',         unit: 'cup', usd: 2.10, aliases: ['raspberries', 'raspberry'],   category: 'produce', alternates: [{ unit: 'oz', usd: 0.42 }, { unit: 'pint', usd: 3.50 }] },
  { key: 'strawberries',        unit: 'cup', usd: 2.00, aliases: ['strawberries', 'strawberry'], category: 'produce', alternates: [{ unit: 'oz', usd: 0.40 }, { unit: 'lb', usd: 4.00 }, { unit: 'pint', usd: 3.50 }, { unit: 'each', usd: 0.20 }] },
  { key: 'mixed berries',       unit: 'cup', usd: 1.40, aliases: ['mixed berries', 'berries'],   category: 'produce', alternates: [{ unit: 'oz', usd: 0.28 }, { unit: 'lb', usd: 4.50 }] },
  { key: 'lemon',               unit: 'each', usd: 0.45, aliases: ['lemon'],                     category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.15 }, { unit: 'tsp', usd: 0.05 }] },
  { key: 'lime',                unit: 'each', usd: 0.50, aliases: ['lime'],                      category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.17 }, { unit: 'tsp', usd: 0.06 }] },
  { key: 'orange',              unit: 'each', usd: 0.80, aliases: ['orange', 'oranges'],         category: 'produce', alternates: [{ unit: 'cup', usd: 0.80 }, { unit: 'lb', usd: 2.00 }] },
  { key: 'grapefruit',          unit: 'each', usd: 1.50, aliases: ['grapefruit'],                category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'half', usd: 0.75 }] },
  { key: 'avocado',             unit: 'each', usd: 1.60, aliases: ['avocado', 'avocados'],       category: 'produce', alternates: [{ unit: 'cup', usd: 1.60 }, { unit: 'half', usd: 0.80 }, { unit: 'tbsp', usd: 0.10 }] },
  { key: 'peach',               unit: 'each', usd: 0.80, aliases: ['peach', 'peaches'],          category: 'produce', alternates: [{ unit: 'cup', usd: 0.80 }, { unit: 'lb', usd: 2.50 }] },
  { key: 'pear',                unit: 'each', usd: 1.00, aliases: ['pear', 'pears'],             category: 'produce', alternates: [{ unit: 'cup', usd: 1.00 }, { unit: 'lb', usd: 2.50 }] },
  { key: 'grape',               unit: 'cup', usd: 2.00, aliases: ['grape', 'grapes'],            category: 'produce', alternates: [{ unit: 'lb', usd: 3.50 }, { unit: 'oz', usd: 0.40 }] },
  { key: 'mango',               unit: 'each', usd: 1.50, aliases: ['mango', 'mangoes'],          category: 'produce', alternates: [{ unit: 'cup', usd: 1.50 }, { unit: 'lb', usd: 2.50 }] },
  { key: 'pineapple',           unit: 'each', usd: 4.00, aliases: ['pineapple'],                 category: 'produce', alternates: [{ unit: 'cup', usd: 0.80 }, { unit: 'lb', usd: 1.50 }, { unit: 'ring', usd: 0.40 }] },
  { key: 'kiwi',                unit: 'each', usd: 0.60, aliases: ['kiwi', 'kiwifruit'],         category: 'produce', alternates: [{ unit: 'cup', usd: 1.20 }] },
  { key: 'watermelon',          unit: 'lb', usd: 0.60, aliases: ['watermelon'],                  category: 'produce', alternates: [{ unit: 'cup', usd: 0.30 }, { unit: 'wedge', usd: 1.50 }] },
  { key: 'raisin',              unit: 'oz', usd: 0.25, aliases: ['raisin', 'sultanas'],          category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.08 }, { unit: 'cup', usd: 1.20 }] },
  { key: 'date',                unit: 'oz', usd: 0.75, aliases: ['date', 'dates', 'medjool'],    category: 'produce', alternates: [{ unit: 'each', usd: 0.40 }, { unit: 'cup', usd: 6.00 }] },

  // ── Nuts / seeds ─────────────────────────────────────────────────────
  { key: 'almonds',             unit: 'oz', usd: 0.60, aliases: ['almond', 'sliced almonds', 'raw almonds'], category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.20 }, { unit: 'cup', usd: 3.00 }] },
  { key: 'walnuts',             unit: 'oz', usd: 0.75, aliases: ['walnut'],                      category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.20 }, { unit: 'cup', usd: 3.75 }] },
  { key: 'pecans',              unit: 'oz', usd: 1.10, aliases: ['pecan'],                       category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.28 }, { unit: 'cup', usd: 4.40 }] },
  { key: 'cashews',             unit: 'oz', usd: 0.90, aliases: ['cashew'],                      category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.25 }, { unit: 'cup', usd: 4.05 }] },
  { key: 'pistachios',           unit: 'oz', usd: 0.85, aliases: ['pistachio'],                  category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.24 }, { unit: 'cup', usd: 3.80 }] },
  { key: 'hazelnuts',           unit: 'oz', usd: 1.20, aliases: ['hazelnut'],                    category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.34 }, { unit: 'cup', usd: 5.40 }] },
  { key: 'macadamia',           unit: 'oz', usd: 2.00, aliases: ['macadamia'],                   category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.56 }, { unit: 'cup', usd: 9.00 }] },
  { key: 'pine nuts',           unit: 'oz', usd: 3.50, aliases: ['pine nut', 'pignoli'],         category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.98 }, { unit: 'cup', usd: 15.75 }] },
  { key: 'brazil nuts',         unit: 'oz', usd: 1.00, aliases: ['brazil nut'],                  category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.28 }, { unit: 'cup', usd: 4.50 }] },
  { key: 'chia seeds',          unit: 'tbsp', usd: 0.20, aliases: ['chia', 'chia seed'],         category: 'pantry', alternates: [{ unit: 'cup', usd: 3.20 }, { unit: 'oz', usd: 0.72 }] },
  { key: 'sesame seeds',        unit: 'tbsp', usd: 0.20, aliases: ['sesame seed'],               category: 'pantry', alternates: [{ unit: 'cup', usd: 3.20 }, { unit: 'oz', usd: 0.72 }] },
  { key: 'flax seeds',          unit: 'tbsp', usd: 0.15, aliases: ['flax', 'flaxseed', 'linseed'], category: 'pantry', alternates: [{ unit: 'cup', usd: 2.40 }, { unit: 'oz', usd: 0.54 }] },
  { key: 'pumpkin seeds',       unit: 'oz', usd: 0.85, aliases: ['pumpkin seed', 'pepitas'],     category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.24 }, { unit: 'cup', usd: 3.80 }] },
  { key: 'sunflower seeds',     unit: 'oz', usd: 0.35, aliases: ['sunflower seed'],              category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.10 }, { unit: 'cup', usd: 1.60 }] },
  { key: 'hemp hearts',         unit: 'oz', usd: 1.50, aliases: ['hemp heart', 'hemp seed'],     category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.42 }, { unit: 'cup', usd: 6.75 }] },
  { key: 'almond butter',       unit: 'tbsp', usd: 0.60, aliases: ['almond butter'],             category: 'pantry' },
  { key: 'natural peanut butter', unit: 'tbsp', usd: 0.47, aliases: ['peanut butter', 'natural peanut butter', 'pb'], category: 'pantry' },
  { key: 'tahini',              unit: 'tbsp', usd: 0.55, aliases: ['tahini', 'sesame paste'],    category: 'pantry' },

  // ── Fats / oils / sweeteners ─────────────────────────────────────────
  { key: 'olive oil',           unit: 'tbsp', usd: 0.30, aliases: ['olive oil', 'evoo', 'extra virgin olive oil'], category: 'oils' },
  { key: 'sesame oil',          unit: 'tbsp', usd: 0.40, aliases: ['sesame oil'],                category: 'oils' },
  { key: 'coconut oil',         unit: 'tbsp', usd: 0.25, aliases: ['coconut oil'],               category: 'oils' },
  { key: 'canola oil',          unit: 'tbsp', usd: 0.15, aliases: ['canola oil', 'rapeseed oil'], category: 'oils' },
  { key: 'avocado oil',         unit: 'tbsp', usd: 0.60, aliases: ['avocado oil'],               category: 'oils' },
  { key: 'vegetable oil',       unit: 'tbsp', usd: 0.15, aliases: ['vegetable oil', 'soybean oil'], category: 'oils' },
  { key: 'honey',               unit: 'tbsp', usd: 0.35, aliases: ['honey'],                     category: 'pantry' },
  { key: 'maple syrup',         unit: 'tbsp', usd: 0.60, aliases: ['maple syrup'],               category: 'pantry' },
  { key: 'brown sugar',         unit: 'tbsp', usd: 0.05, aliases: ['brown sugar'],               category: 'pantry' },
  { key: 'white sugar',         unit: 'tbsp', usd: 0.03, aliases: ['sugar', 'white sugar', 'granulated sugar'], category: 'pantry' },
  { key: 'balsamic vinegar',    unit: 'tbsp', usd: 0.25, aliases: ['balsamic'],                  category: 'condiments' },
  { key: 'apple cider vinegar', unit: 'tbsp', usd: 0.10, aliases: ['apple cider vinegar', 'acv'], category: 'condiments' },
  { key: 'rice vinegar',        unit: 'tbsp', usd: 0.15, aliases: ['rice vinegar', 'rice wine vinegar'], category: 'condiments' },

  // ── Condiments / sauces ──────────────────────────────────────────────
  { key: 'marinara sauce',      unit: 'cup', usd: 3.00, aliases: ['marinara', 'pasta sauce', 'tomato sauce'], category: 'condiments' },
  { key: 'basil pesto',         unit: 'tbsp', usd: 1.20, aliases: ['pesto', 'basil pesto'],      category: 'condiments' },
  { key: 'caesar dressing',     unit: 'tbsp', usd: 0.60, aliases: ['caesar dressing'],           category: 'condiments' },
  { key: 'hummus',              unit: 'tbsp', usd: 0.90, aliases: ['hummus'],                    category: 'condiments' },
  { key: 'tzatziki',            unit: 'tbsp', usd: 1.20, aliases: ['tzatziki'],                  category: 'condiments' },
  { key: 'salsa',               unit: 'tbsp', usd: 0.25, aliases: ['salsa', 'pico de gallo'],    category: 'condiments' },
  { key: 'guacamole',           unit: 'tbsp', usd: 0.75, aliases: ['guacamole', 'guac'],         category: 'condiments' },
  { key: 'dijon mustard',       unit: 'tsp', usd: 0.10, aliases: ['dijon', 'mustard'],           category: 'condiments' },
  { key: 'capers',              unit: 'tsp', usd: 0.15, aliases: ['capers'],                     category: 'condiments' },
  { key: 'sauerkraut',          unit: 'oz', usd: 0.30, aliases: ['sauerkraut'],                  category: 'condiments', alternates: [{ unit: 'cup', usd: 2.40 }] },
  { key: 'kimchi',              unit: 'oz', usd: 0.40, aliases: ['kimchi'],                      category: 'condiments', alternates: [{ unit: 'cup', usd: 3.20 }, { unit: 'tbsp', usd: 0.25 }] },
  { key: 'tamari',              unit: 'tbsp', usd: 0.40, aliases: ['tamari', 'soy sauce'],       category: 'condiments' },
  { key: 'white miso paste',    unit: 'tbsp', usd: 1.00, aliases: ['miso', 'white miso'],        category: 'condiments' },
  { key: 'fish sauce',          unit: 'tbsp', usd: 0.20, aliases: ['fish sauce', 'nam pla'],     category: 'condiments' },
  { key: 'hoisin sauce',        unit: 'tbsp', usd: 0.30, aliases: ['hoisin'],                    category: 'condiments' },
  { key: 'sriracha',            unit: 'tbsp', usd: 0.15, aliases: ['sriracha', 'hot sauce'],     category: 'condiments' },
  { key: 'worcestershire',      unit: 'tbsp', usd: 0.20, aliases: ['worcestershire'],            category: 'condiments' },
  { key: 'mayonnaise',          unit: 'tbsp', usd: 0.15, aliases: ['mayonnaise', 'mayo'],        category: 'condiments' },
  { key: 'ketchup',             unit: 'tbsp', usd: 0.05, aliases: ['ketchup', 'catsup'],         category: 'condiments' },

  // ── Broths ───────────────────────────────────────────────────────────
  { key: 'chicken broth',       unit: 'cup', usd: 1.50, aliases: ['chicken broth', 'chicken stock'], category: 'pantry' },
  { key: 'vegetable broth',     unit: 'cup', usd: 3.00, aliases: ['vegetable broth', 'vegetable stock'], category: 'pantry' },
  // beef broth consolidated into the additions block below.

  // ── Spices (all per tsp; prices are lifetime-amortised) ──────────────
  { key: 'cinnamon',            unit: 'tsp', usd: 0.05, aliases: ['cinnamon'],                   category: 'spices' },
  { key: 'cumin',               unit: 'tsp', usd: 0.10, aliases: ['cumin'],                      category: 'spices' },
  { key: 'curry powder',        unit: 'tsp', usd: 0.15, aliases: ['curry powder', 'curry'],      category: 'spices' },
  { key: 'chili powder',        unit: 'tsp', usd: 0.10, aliases: ['chili powder'],               category: 'spices' },
  { key: 'smoked paprika',      unit: 'tsp', usd: 0.08, aliases: ['paprika', 'smoked paprika'],  category: 'spices' },
  { key: 'garlic powder',       unit: 'tsp', usd: 0.10, aliases: ['garlic powder'],              category: 'spices' },
  { key: 'italian seasoning',   unit: 'tsp', usd: 0.10, aliases: ['italian seasoning'],          category: 'spices' },
  { key: 'red pepper flakes',   unit: 'tsp', usd: 0.05, aliases: ['red pepper flakes', 'chili flakes'], category: 'spices' },
  { key: 'everything bagel seasoning', unit: 'tsp', usd: 0.15, aliases: ['everything', 'everything bagel', 'everything seasoning'], category: 'spices' },
  { key: 'dill',                unit: 'tsp', usd: 0.10, aliases: ['dill'],                       category: 'spices' },
  { key: 'basil',               unit: 'tsp', usd: 0.10, aliases: ['basil'],                      category: 'spices' },
  { key: 'oregano',             unit: 'tsp', usd: 0.05, aliases: ['oregano'],                    category: 'spices' },
  { key: 'thyme',               unit: 'tsp', usd: 0.05, aliases: ['thyme'],                      category: 'spices' },
  { key: 'rosemary',            unit: 'tsp', usd: 0.05, aliases: ['rosemary'],                   category: 'spices' },
  { key: 'black pepper',        unit: 'tsp', usd: 0.05, aliases: ['black pepper', 'pepper'],     category: 'spices' },
  { key: 'salt',                unit: 'tsp', usd: 0.01, aliases: ['salt', 'sea salt', 'kosher salt'], category: 'spices' },
  { key: 'turmeric',            unit: 'tsp', usd: 0.10, aliases: ['turmeric'],                   category: 'spices' },
  { key: 'nutmeg',              unit: 'tsp', usd: 0.15, aliases: ['nutmeg'],                     category: 'spices' },
  { key: 'ginger powder',       unit: 'tsp', usd: 0.10, aliases: ['ground ginger', 'ginger powder'], category: 'spices' },
  { key: 'bay leaf',            unit: 'each', usd: 0.10, aliases: ['bay leaf', 'bay leaves'],    category: 'spices' },
  { key: 'vanilla extract',     unit: 'tsp', usd: 0.20, aliases: ['vanilla', 'vanilla extract'], category: 'pantry' },
  { key: 'cocoa powder',        unit: 'tbsp', usd: 0.20, aliases: ['cocoa powder', 'cacao powder'], category: 'pantry' },
  { key: 'chocolate (unsweetened)', unit: 'oz', usd: 0.75, aliases: ['chocolate unsweetened'], category: 'pantry' },
  { key: 'nutritional yeast',   unit: 'tbsp', usd: 0.20, aliases: ['nutritional yeast', 'nooch'], category: 'pantry' },
  { key: 'granola',             unit: 'cup', usd: 1.50, aliases: ['granola'],                    category: 'pantry' },

  // ── Fresh herbs (per tbsp fresh-chopped; bunch-lifetime amortised) ───
  { key: 'chives',              unit: 'tbsp', usd: 0.15, aliases: ['chives'],                    category: 'produce', alternates: [{ unit: 'tsp', usd: 0.05 }, { unit: 'bunch', usd: 1.80 }] },
  { key: 'cilantro',            unit: 'tbsp', usd: 0.15, aliases: ['cilantro'],                  category: 'produce', alternates: [{ unit: 'tsp', usd: 0.05 }, { unit: 'cup', usd: 0.80 }, { unit: 'bunch', usd: 1.50 }] },
  { key: 'fresh parsley',       unit: 'tbsp', usd: 0.15, aliases: ['fresh parsley', 'parsley'],  category: 'produce', alternates: [{ unit: 'tsp', usd: 0.05 }, { unit: 'cup', usd: 0.80 }, { unit: 'bunch', usd: 1.50 }] },
  { key: 'fresh mint',          unit: 'tbsp', usd: 0.20, aliases: ['fresh mint', 'mint'],        category: 'produce', alternates: [{ unit: 'tsp', usd: 0.07 }, { unit: 'cup', usd: 1.20 }, { unit: 'bunch', usd: 2.00 }] },
  { key: 'fresh basil',         unit: 'tbsp', usd: 0.20, aliases: ['fresh basil'],               category: 'produce', alternates: [{ unit: 'tsp', usd: 0.07 }, { unit: 'cup', usd: 1.50 }, { unit: 'bunch', usd: 2.50 }] },

  // ── Low-FODMAP additions ─────────────────────────────────────────────
  { key: 'buckwheat flour',     unit: 'cup', usd: 1.50, aliases: ['buckwheat flour'],            category: 'grains', alternates: [{ unit: 'lb', usd: 4.50 }] },
  { key: 'baby bok choy',       unit: 'each', usd: 0.75, aliases: ['baby bok choy'],             category: 'produce', alternates: [{ unit: 'cup', usd: 0.60 }, { unit: 'lb', usd: 3.00 }] },
  { key: 'polenta (dry)',       unit: 'cup', usd: 1.00, aliases: ['polenta', 'polenta dry', 'polenta (dry)'], category: 'grains', alternates: [{ unit: 'lb', usd: 3.00 }] },

  // ── Herbs & spices additions ─────────────────────────────────────────
  { key: 'fresh cilantro',      unit: 'tbsp', usd: 0.15, aliases: ['fresh cilantro'],            category: 'produce', alternates: [{ unit: 'tsp', usd: 0.05 }, { unit: 'cup', usd: 0.80 }, { unit: 'bunch', usd: 1.50 }] },
  { key: 'fresh thyme',         unit: 'tsp', usd: 0.10, aliases: ['fresh thyme'],                category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.25 }, { unit: 'bunch', usd: 2.00 }] },
  { key: 'fresh rosemary',      unit: 'tsp', usd: 0.10, aliases: ['fresh rosemary'],             category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.25 }, { unit: 'bunch', usd: 2.00 }] },
  { key: 'fresh oregano',       unit: 'tsp', usd: 0.10, aliases: ['fresh oregano'],              category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.25 }, { unit: 'bunch', usd: 2.00 }] },
  { key: 'fresh sage',          unit: 'tsp', usd: 0.10, aliases: ['fresh sage'],                 category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.25 }, { unit: 'bunch', usd: 2.00 }] },
  { key: 'sage',                unit: 'tsp', usd: 0.10, aliases: ['sage', 'dried sage'],         category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.30 }] },
  { key: 'fresh dill',          unit: 'tsp', usd: 0.10, aliases: ['fresh dill'],                 category: 'produce', alternates: [{ unit: 'tbsp', usd: 0.25 }, { unit: 'bunch', usd: 2.00 }] },
  { key: 'ground turmeric',     unit: 'tsp', usd: 0.10, aliases: ['ground turmeric'],            category: 'spices' },
  { key: 'dried thyme',         unit: 'tsp', usd: 0.05, aliases: ['dried thyme'],                category: 'spices' },
  { key: 'dried rosemary',      unit: 'tsp', usd: 0.05, aliases: ['dried rosemary'],             category: 'spices' },
  { key: 'dried basil',         unit: 'tsp', usd: 0.05, aliases: ['dried basil'],                category: 'spices' },
  { key: 'dried sage',          unit: 'tsp', usd: 0.05, aliases: ['dried sage'],                 category: 'spices' },
  { key: 'coriander',           unit: 'tsp', usd: 0.10, aliases: ['coriander', 'ground coriander', 'coriander seed'], category: 'spices' },
  { key: 'cayenne',             unit: 'tsp', usd: 0.05, aliases: ['cayenne', 'cayenne pepper'],  category: 'spices' },
  { key: 'sumac',               unit: 'tsp', usd: 0.20, aliases: ['sumac'],                      category: 'spices' },
  { key: 'saffron',             unit: 'tsp', usd: 3.00, aliases: ['saffron'],                    category: 'spices' },
  { key: 'garam masala',        unit: 'tsp', usd: 0.15, aliases: ['garam masala'],               category: 'spices' },
  { key: 'cardamom',            unit: 'tsp', usd: 0.20, aliases: ['cardamom', 'ground cardamom'],category: 'spices' },
  { key: 'star anise',          unit: 'each', usd: 0.05, aliases: ['star anise'],                category: 'spices' },
  { key: 'caraway seeds',       unit: 'tsp', usd: 0.10, aliases: ['caraway seeds', 'caraway', 'ground caraway'], category: 'spices' },
  { key: 'cloves',              unit: 'tsp', usd: 0.10, aliases: ['cloves', 'ground cloves', 'whole cloves'], category: 'spices' },
  { key: 'poppy seeds',         unit: 'tsp', usd: 0.10, aliases: ['poppy seeds'],                category: 'spices' },
  // sesame seeds already defined in pantry section (line ~252) with cup/oz alternates.
  { key: 'cajun seasoning',     unit: 'tsp', usd: 0.10, aliases: ['cajun seasoning'],            category: 'spices' },
  { key: 'jerk seasoning',      unit: 'tsp', usd: 0.10, aliases: ['jerk seasoning'],             category: 'spices' },
  { key: 'berbere',             unit: 'tsp', usd: 0.15, aliases: ['berbere'],                    category: 'spices' },
  { key: 'harissa paste',       unit: 'tbsp', usd: 0.40, aliases: ['harissa', 'harissa paste'],  category: 'condiments' },
  { key: 'red pepper paste',    unit: 'tbsp', usd: 0.35, aliases: ['pepper paste', 'red pepper paste'], category: 'condiments' },
  { key: 'gochujang',           unit: 'tbsp', usd: 0.30, aliases: ['gochujang'],                 category: 'condiments' },
  { key: 'coconut aminos',      unit: 'tbsp', usd: 0.35, aliases: ['coconut aminos'],            category: 'condiments', alternates: [{ unit: 'tsp', usd: 0.12 }, { unit: 'cup', usd: 5.00 }] },
  { key: 'tamari (gluten-free)',unit: 'tbsp', usd: 0.40, aliases: ['tamari gluten-free', 'tamari gluten free', 'gluten-free tamari'], category: 'condiments', alternates: [{ unit: 'tsp', usd: 0.13 }] },
  { key: 'kecap manis',         unit: 'tbsp', usd: 0.30, aliases: ['kecap manis', 'sweet soy sauce'], category: 'condiments' },
  { key: 'sweet chili sauce',   unit: 'tbsp', usd: 0.20, aliases: ['sweet chili sauce'],         category: 'condiments' },
  { key: 'mirin',               unit: 'tbsp', usd: 0.25, aliases: ['mirin'],                     category: 'condiments', alternates: [{ unit: 'tsp', usd: 0.08 }] },
  { key: 'red wine vinegar',    unit: 'tbsp', usd: 0.15, aliases: ['red wine vinegar'],          category: 'condiments', alternates: [{ unit: 'tsp', usd: 0.05 }, { unit: 'cup', usd: 2.00 }] },
  { key: 'white vinegar',       unit: 'tbsp', usd: 0.05, aliases: ['white vinegar', 'distilled vinegar'], category: 'condiments', alternates: [{ unit: 'cup', usd: 0.60 }] },
  { key: 'chipotle in adobo',   unit: 'each', usd: 0.30, aliases: ['chipotle in adobo', 'chipotle'], category: 'condiments' },
  { key: 'pomegranate molasses',unit: 'tbsp', usd: 0.50, aliases: ['pomegranate molasses'],      category: 'condiments' },
  { key: 'labneh',              unit: 'tbsp', usd: 0.35, aliases: ['labneh'],                    category: 'dairy', alternates: [{ unit: 'cup', usd: 4.00 }, { unit: 'oz', usd: 0.50 }] },
  { key: 'baking powder',       unit: 'tsp', usd: 0.05, aliases: ['baking powder'],              category: 'pantry', alternates: [{ unit: 'tbsp', usd: 0.15 }] },
  { key: 'baking soda',         unit: 'tsp', usd: 0.05, aliases: ['baking soda', 'bicarbonate of soda'], category: 'pantry' },
  { key: 'dashi stock',         unit: 'cup', usd: 1.20, aliases: ['dashi', 'dashi stock'],       category: 'pantry' },
  { key: 'beef broth',          unit: 'cup', usd: 1.80, aliases: ['beef broth', 'beef stock'],   category: 'pantry' },
  { key: 'doubanjiang',         unit: 'tbsp', usd: 0.30, aliases: ['doubanjiang'],               category: 'condiments' },
  { key: 'laksa paste',         unit: 'tbsp', usd: 0.40, aliases: ['laksa paste'],               category: 'condiments' },
  { key: 'aji amarillo paste',  unit: 'tbsp', usd: 0.50, aliases: ['aji amarillo paste', 'aji amarillo'], category: 'condiments' },

  // ── Grains / flours ──────────────────────────────────────────────────
  { key: 'flour',               unit: 'cup', usd: 0.35, aliases: ['flour', 'all-purpose flour', 'white flour', 'wheat flour'], category: 'grains', alternates: [{ unit: 'tbsp', usd: 0.02 }, { unit: 'lb', usd: 1.10 }] },
  { key: 'chickpea flour',      unit: 'cup', usd: 1.50, aliases: ['chickpea flour', 'garbanzo flour', 'besan'], category: 'grains', alternates: [{ unit: 'lb', usd: 4.50 }] },
  { key: 'tapioca flour',       unit: 'cup', usd: 1.75, aliases: ['tapioca flour', 'tapioca starch'], category: 'grains' },
  { key: 'masa harina',         unit: 'cup', usd: 0.80, aliases: ['masa harina'],                category: 'grains' },
  { key: 'arepa flour',         unit: 'cup', usd: 1.00, aliases: ['arepa flour'],                category: 'grains' },
  { key: 'polenta',             unit: 'cup', usd: 0.90, aliases: ['polenta'],                    category: 'grains' },
  { key: 'orzo',                unit: 'cup', usd: 1.20, aliases: ['orzo'],                       category: 'grains' },
  { key: 'egg noodles',         unit: 'oz', usd: 0.30, aliases: ['egg noodles'],                 category: 'grains', alternates: [{ unit: 'cup', usd: 0.60 }, { unit: 'lb', usd: 4.50 }] },
  { key: 'ramen noodles',       unit: 'oz', usd: 0.35, aliases: ['ramen noodles', 'instant ramen'], category: 'grains' },
  { key: 'lasagna noodles',     unit: 'oz', usd: 0.30, aliases: ['lasagna noodles', 'lasagne noodles'], category: 'grains', alternates: [{ unit: 'each', usd: 0.15 }] },
  { key: 'flat noodles',        unit: 'oz', usd: 0.35, aliases: ['flat noodles', 'wide rice noodles'], category: 'grains' },
  { key: 'gnocchi',             unit: 'oz', usd: 0.50, aliases: ['gnocchi'],                     category: 'grains', alternates: [{ unit: 'cup', usd: 2.00 }] },
  { key: 'millet',              unit: 'cup', usd: 1.00, aliases: ['millet'],                     category: 'grains', alternates: [{ unit: 'lb', usd: 3.50 }] },
  { key: 'amaranth',            unit: 'cup', usd: 1.80, aliases: ['amaranth'],                   category: 'grains' },
  { key: 'hominy',              unit: 'cup', usd: 1.20, aliases: ['hominy'],                     category: 'grains', alternates: [{ unit: 'can', usd: 2.00 }] },
  { key: 'nori',                unit: 'sheet', usd: 0.30, aliases: ['nori', 'seaweed'],          category: 'pantry' },

  // ── Bakery ────────────────────────────────────────────────────────────
  { key: 'baguette',            unit: 'each', usd: 3.00, aliases: ['baguette', 'french bread'],  category: 'bakery' },
  { key: 'sub roll',            unit: 'each', usd: 0.75, aliases: ['sub roll', 'hoagie roll'],   category: 'bakery' },
  { key: 'slider buns',         unit: 'each', usd: 0.40, aliases: ['slider buns', 'slider bun'], category: 'bakery' },
  { key: 'ciabatta roll',       unit: 'each', usd: 1.20, aliases: ['ciabatta roll', 'ciabatta'], category: 'bakery' },
  { key: 'whole-grain crackers',unit: 'each', usd: 0.10, aliases: ['whole-grain crackers', 'whole grain crackers'], category: 'bakery' },
  { key: 'whole-grain english muffin', unit: 'each', usd: 0.65, aliases: ['whole-grain english muffin', 'whole grain english muffin'], category: 'bakery' },
  { key: 'whole-grain buns',    unit: 'each', usd: 0.70, aliases: ['whole-grain buns', 'whole grain buns'], category: 'bakery' },
  { key: 'phyllo dough',        unit: 'sheet', usd: 0.35, aliases: ['phyllo dough', 'filo dough', 'phyllo'], category: 'bakery' },
  { key: 'roti',                unit: 'each', usd: 0.75, aliases: ['roti'],                      category: 'bakery' },
  { key: 'injera',              unit: 'each', usd: 1.50, aliases: ['injera'],                    category: 'bakery' },
  { key: 'attieke',             unit: 'cup', usd: 1.20, aliases: ['attieke'],                    category: 'bakery' },
  { key: 'empanada discs',      unit: 'each', usd: 0.40, aliases: ['empanada discs'],            category: 'bakery' },
  { key: 'pierogi dough sheets',unit: 'sheet', usd: 0.50, aliases: ['pierogi dough sheets', 'pierogi dough'], category: 'bakery', alternates: [{ unit: 'each', usd: 0.50 }] },
  { key: 'spring roll wrappers',unit: 'each', usd: 0.15, aliases: ['spring roll wrappers'],      category: 'bakery' },

  // ── Meats & sausages ─────────────────────────────────────────────────
  { key: 'ground pork',         unit: 'lb', usd: 5.00, aliases: ['ground pork'],                 category: 'meat' },
  { key: 'ground lamb',         unit: 'lb', usd: 10.00, aliases: ['ground lamb'],                category: 'meat' },
  { key: 'lamb loin chops',     unit: 'lb', usd: 15.00, aliases: ['lamb loin chops', 'lamb chop'], category: 'meat' },
  { key: 'sirloin steak',       unit: 'lb', usd: 12.00, aliases: ['sirloin steak', 'sirloin', 'top sirloin'], category: 'meat' },
  { key: 'chicken drumsticks',  unit: 'lb', usd: 3.50, aliases: ['chicken drumsticks', 'chicken drumstick'], category: 'meat' },
  { key: 'chicken thighs (boneless skinless)', unit: 'lb', usd: 6.50, aliases: ['chicken thighs boneless skinless', 'boneless skinless chicken thighs'], category: 'meat' },
  { key: 'pork loin chops',     unit: 'lb', usd: 6.00, aliases: ['pork loin chops', 'pork chops', 'pork chop'], category: 'meat' },
  { key: 'chicken sausage',     unit: 'lb', usd: 8.00, aliases: ['chicken sausage', 'chicken chorizo'], category: 'meat', alternates: [{ unit: 'oz', usd: 0.50 }, { unit: 'link', usd: 1.50 }] },
  { key: 'turkey sausage',      unit: 'lb', usd: 7.00, aliases: ['turkey sausage', 'turkey chorizo'], category: 'meat', alternates: [{ unit: 'oz', usd: 0.45 }, { unit: 'link', usd: 1.30 }] },
  { key: 'turkey breakfast sausage', unit: 'link', usd: 0.80, aliases: ['turkey breakfast sausage', 'breakfast sausage'], category: 'meat', alternates: [{ unit: 'oz', usd: 0.55 }] },
  { key: 'andouille sausage',   unit: 'lb', usd: 8.00, aliases: ['andouille sausage', 'andouille'], category: 'meat' },
  { key: 'genoa salami',        unit: 'oz', usd: 0.75, aliases: ['genoa salami', 'salami'],      category: 'meat' },
  { key: 'chinese sausage',     unit: 'oz', usd: 0.70, aliases: ['chinese sausage', 'lap cheong'],category: 'meat' },
  { key: 'turkey drumsticks',   unit: 'lb', usd: 3.00, aliases: ['turkey drumsticks', 'turkey drumstick'], category: 'meat' },
  { key: 'turkey cutlets',      unit: 'lb', usd: 6.50, aliases: ['turkey cutlets', 'turkey cutlet'], category: 'meat' },
  { key: 'sliced turkey',       unit: 'oz', usd: 0.65, aliases: ['sliced turkey', 'deli turkey'],category: 'meat' },
  { key: 'deli ham',            unit: 'oz', usd: 0.60, aliases: ['deli ham'],                    category: 'meat', alternates: [{ unit: 'slice', usd: 0.30 }] },
  { key: 'turkey hot dogs',     unit: 'each', usd: 0.75, aliases: ['turkey hot dogs', 'turkey hot dog'], category: 'meat' },

  // ── Cheeses ──────────────────────────────────────────────────────────
  { key: 'monterey jack',       unit: 'oz', usd: 0.55, aliases: ['monterey jack'],               category: 'dairy', alternates: [{ unit: 'cup', usd: 2.00 }, { unit: 'slice', usd: 0.35 }] },
  { key: 'gruyere',             unit: 'oz', usd: 1.20, aliases: ['gruyere', 'gruyère'],          category: 'dairy', alternates: [{ unit: 'cup', usd: 4.50 }] },
  { key: 'swiss cheese',        unit: 'oz', usd: 0.75, aliases: ['swiss cheese'],                category: 'dairy', alternates: [{ unit: 'slice', usd: 0.50 }, { unit: 'cup', usd: 2.50 }] },
  { key: 'brie cheese',         unit: 'oz', usd: 1.00, aliases: ['brie cheese', 'brie', 'burrata'], category: 'dairy' },
  { key: 'provolone cheese',    unit: 'oz', usd: 0.85, aliases: ['provolone cheese', 'provolone'], category: 'dairy', alternates: [{ unit: 'slice', usd: 0.55 }] },
  { key: 'queso fresco',        unit: 'oz', usd: 0.60, aliases: ['queso fresco'],                category: 'dairy', alternates: [{ unit: 'cup', usd: 2.20 }] },
  { key: 'cotija cheese',       unit: 'oz', usd: 0.75, aliases: ['cotija cheese', 'cotija'],     category: 'dairy', alternates: [{ unit: 'cup', usd: 3.00 }] },
  { key: 'goat cheese',         unit: 'oz', usd: 1.25, aliases: ['goat cheese', 'chevre'],       category: 'dairy', alternates: [{ unit: 'cup', usd: 5.00 }, { unit: 'tbsp', usd: 0.35 }] },

  // ── Produce / veg gaps ───────────────────────────────────────────────
  { key: 'romaine lettuce',     unit: 'head', usd: 2.00, aliases: ['romaine lettuce', 'romaine', 'cos lettuce'], category: 'produce', alternates: [{ unit: 'cup', usd: 0.60 }, { unit: 'leaf', usd: 0.10 }, { unit: 'leaves', usd: 0.10 }, { unit: 'oz', usd: 0.20 }] },
  { key: 'jalapeño',            unit: 'each', usd: 0.30, aliases: ['jalapeño', 'jalapeno'],      category: 'produce' },
  { key: 'poblano pepper',      unit: 'each', usd: 0.60, aliases: ['poblano pepper', 'poblano'], category: 'produce' },
  { key: 'red chili',           unit: 'each', usd: 0.20, aliases: ['red chili', 'fresh red chili'], category: 'produce' },
  { key: 'dried red chilies',   unit: 'each', usd: 0.15, aliases: ['dried red chilies'],         category: 'spices' },
  { key: 'dried guajillo chiles', unit: 'each', usd: 0.25, aliases: ['dried guajillo chiles', 'guajillo'], category: 'spices' },
  { key: 'tomatillos',          unit: 'lb', usd: 3.00, aliases: ['tomatillos', 'tomatillo'],     category: 'produce' },
  { key: 'yellow squash',       unit: 'each', usd: 1.00, aliases: ['yellow squash', 'summer squash'], category: 'produce' },
  { key: 'green cabbage',       unit: 'head', usd: 3.00, aliases: ['green cabbage', 'cabbage'],  category: 'produce', alternates: [{ unit: 'cup', usd: 0.40 }, { unit: 'lb', usd: 1.20 }] },
  { key: 'bean sprouts',        unit: 'cup', usd: 0.80, aliases: ['bean sprouts', 'mung bean sprouts'], category: 'produce' },
  { key: 'plantain',            unit: 'each', usd: 0.75, aliases: ['plantain'],                  category: 'produce' },
  { key: 'lemongrass',          unit: 'stalk', usd: 0.75, aliases: ['lemongrass'],               category: 'produce' },
  { key: 'green tea',           unit: 'cup', usd: 0.10, aliases: ['green tea', 'matcha'],        category: 'beverages' },
  { key: 'microgreens',         unit: 'cup', usd: 2.50, aliases: ['microgreens'],                category: 'produce' },
  { key: 'green papaya',        unit: 'cup', usd: 1.50, aliases: ['green papaya'],               category: 'produce', alternates: [{ unit: 'each', usd: 3.50 }] },
  { key: 'galangal',            unit: 'tbsp', usd: 0.30, aliases: ['galangal', 'fresh galangal'],category: 'produce' },
  { key: 'pandan leaves',       unit: 'leaf', usd: 0.25, aliases: ['pandan leaves', 'pandan'],   category: 'produce', alternates: [{ unit: 'each', usd: 0.25 }] },
  { key: 'coconut flakes',      unit: 'tbsp', usd: 0.10, aliases: ['coconut flakes'],            category: 'pantry', alternates: [{ unit: 'cup', usd: 1.20 }] },
  { key: 'fava beans',          unit: 'cup', usd: 1.60, aliases: ['fava beans'],                 category: 'legumes', alternates: [{ unit: 'can', usd: 2.00 }] },
  { key: 'prunes',              unit: 'each', usd: 0.15, aliases: ['prunes', 'dried plums'],     category: 'produce', alternates: [{ unit: 'cup', usd: 4.00 }] },

  // ── Canned ───────────────────────────────────────────────────────────
  { key: 'olives',              unit: 'oz', usd: 0.40, aliases: ['olive', 'olives', 'green olives', 'black olives'], category: 'condiments', alternates: [{ unit: 'tbsp', usd: 0.20 }, { unit: 'cup', usd: 2.20 }] },
  { key: 'kalamata olives',     unit: 'oz', usd: 0.75, aliases: ['kalamata olives', 'kalamata'], category: 'condiments', alternates: [{ unit: 'tbsp', usd: 0.30 }, { unit: 'cup', usd: 3.50 }] },
  { key: 'canned anchovies',    unit: 'each', usd: 0.20, aliases: ['canned anchovies', 'anchovies', 'anchovy'], category: 'canned' },
  { key: 'canned sardines',     unit: 'can', usd: 2.00, aliases: ['canned sardines'],            category: 'canned', alternates: [{ unit: 'oz', usd: 0.65 }] },
  { key: 'canned tuna in oil',  unit: 'oz', usd: 0.40, aliases: ['canned tuna in oil', 'tuna in oil', 'canned tuna oil'], category: 'canned', alternates: [{ unit: 'can', usd: 2.00 }] },
  { key: 'canned lentils',      unit: 'cup', usd: 1.30, aliases: ['canned lentils', 'lentils canned'], category: 'canned' },
  { key: 'pumpkin puree',       unit: 'cup', usd: 1.20, aliases: ['pumpkin puree', 'canned pumpkin'], category: 'canned' },
  { key: 'refried beans',       unit: 'cup', usd: 1.50, aliases: ['refried beans'],              category: 'canned', alternates: [{ unit: 'can', usd: 1.80 }] },
  { key: 'baked beans',         unit: 'cup', usd: 1.50, aliases: ['baked beans'],                category: 'canned', alternates: [{ unit: 'can', usd: 1.80 }] },
  { key: 'jackfruit',           unit: 'cup', usd: 3.00, aliases: ['jackfruit'],                  category: 'canned', alternates: [{ unit: 'can', usd: 3.50 }] },
  { key: 'pepperoncini',        unit: 'each', usd: 0.15, aliases: ['pepperoncini'],              category: 'condiments', alternates: [{ unit: 'cup', usd: 2.20 }] },
  { key: 'pickles',             unit: 'oz', usd: 0.20, aliases: ['pickle', 'pickles', 'gherkin', 'dill pickle'], category: 'condiments', alternates: [{ unit: 'cup', usd: 1.30 }, { unit: 'each', usd: 0.35 }] },
  { key: 'sun-dried tomatoes',  unit: 'oz', usd: 1.20, aliases: ['sun-dried tomatoes', 'sun dried tomatoes'], category: 'condiments', alternates: [{ unit: 'tbsp', usd: 0.40 }, { unit: 'cup', usd: 4.50 }] },

  // ── Chocolate / sweets ────────────────────────────────────────────────
  { key: 'dark chocolate chips',unit: 'cup', usd: 3.00, aliases: ['dark chocolate chips', 'dark chocolate chip'], category: 'pantry', alternates: [{ unit: 'tbsp', usd: 0.20 }, { unit: 'oz', usd: 0.50 }] },
  { key: 'dark chocolate',      unit: 'oz', usd: 0.75, aliases: ['dark chocolate'],              category: 'pantry', alternates: [{ unit: 'cup', usd: 4.50 }, { unit: 'tbsp', usd: 0.25 }] },
  { key: 'peanuts',             unit: 'oz', usd: 0.35, aliases: ['peanuts'],                     category: 'nuts', alternates: [{ unit: 'tbsp', usd: 0.10 }, { unit: 'cup', usd: 1.50 }] },

  // ── Long-tail additions (rare but present in recipes) ────────────────
  { key: 'blackberry',          unit: 'cup', usd: 3.50, aliases: ['blackberry', 'blackberries'], category: 'produce' },
  { key: 'pomegranate seeds',   unit: 'cup', usd: 3.50, aliases: ['pomegranate seeds', 'pomegranate arils'], category: 'produce' },
  { key: 'ground chicken',      unit: 'lb', usd: 6.50, aliases: ['ground chicken'],              category: 'meat' },
  { key: 'brazil nuts',         unit: 'each', usd: 0.20, aliases: ['brazil nuts'],               category: 'nuts', alternates: [{ unit: 'oz', usd: 1.20 }] },
  { key: 'ahi tuna',            unit: 'lb', usd: 22.00, aliases: ['ahi tuna', 'ahi', 'yellowfin tuna'], category: 'seafood' },
  { key: 'clams',               unit: 'can', usd: 3.00, aliases: ['clams'],                      category: 'seafood' },
  { key: 'mackerel',            unit: 'can', usd: 3.50, aliases: ['mackerel'],                   category: 'seafood', alternates: [{ unit: 'oz', usd: 0.90 }, { unit: 'lb', usd: 11.00 }] },
  { key: 'curry leaves',        unit: 'each', usd: 0.05, aliases: ['curry leaves', 'curry leaf'],category: 'spices' },
  { key: 'tortilla chips',      unit: 'cup', usd: 0.70, aliases: ['tortilla chips'],             category: 'bakery' },
  { key: 'cranberry sauce',     unit: 'cup', usd: 2.20, aliases: ['cranberry sauce'],            category: 'condiments' },
  { key: 'turnip',              unit: 'each', usd: 1.20, aliases: ['turnip'],                    category: 'produce' },
  { key: 'ditalini pasta',      unit: 'cup', usd: 0.70, aliases: ['ditalini pasta', 'ditalini'], category: 'grains' },
  { key: 'macaroni',            unit: 'cup', usd: 0.50, aliases: ['macaroni'],                   category: 'grains', alternates: [{ unit: 'oz', usd: 0.20 }, { unit: 'lb', usd: 2.00 }] },
  { key: 'apricots',            unit: 'cup', usd: 2.50, aliases: ['apricots', 'apricot'],        category: 'produce' },
  { key: 'rice cakes',          unit: 'each', usd: 0.15, aliases: ['rice cakes', 'rice cake'],   category: 'bakery' },
  { key: 'rice paper',          unit: 'each', usd: 0.10, aliases: ['rice paper'],                category: 'bakery' },
  { key: 'chicken wings',       unit: 'lb', usd: 5.50, aliases: ['chicken wings'],               category: 'meat' },
  { key: 'oyster sauce',        unit: 'tbsp', usd: 0.20, aliases: ['oyster sauce'],              category: 'condiments' },
  { key: 'shrimp paste',        unit: 'tsp', usd: 0.25, aliases: ['shrimp paste'],               category: 'condiments' },
  { key: 'red palm oil',        unit: 'tbsp', usd: 0.20, aliases: ['red palm oil', 'palm oil'],  category: 'oils' },
  { key: 'lingonberry jam',     unit: 'cup', usd: 6.00, aliases: ['lingonberry jam'],            category: 'condiments' },
  { key: 'pita chips',          unit: 'cup', usd: 1.00, aliases: ['pita chips'],                 category: 'bakery' },
  { key: 'cantaloupe',          unit: 'each', usd: 4.00, aliases: ['cantaloupe'],                category: 'produce' },
  { key: 'okra',                unit: 'cup', usd: 1.20, aliases: ['okra'],                       category: 'produce' },
  { key: 'apricot jam',         unit: 'tbsp', usd: 0.20, aliases: ['apricot jam'],               category: 'condiments' },
  { key: 'black-eyed peas',     unit: 'can', usd: 1.80, aliases: ['black-eyed peas', 'blackeyed peas', 'black eyed peas'], category: 'canned', alternates: [{ unit: 'cup', usd: 1.30 }] },

  // ── Global cuisine expansion (2026-08 audit) ─────────────────────────
  //
  // Added after a coverage audit flagged 153 ingredient names used by
  // recipes but missing from the catalog. Grouped by category, with
  // aliases wide enough to catch spelling variants (whole-wheat vs
  // whole wheat, kaymak vs kajmak, moong vs mung, etc). Prices are
  // US-baseline retail — international specialty aisles typically run
  // 20-40% higher; the country cost multiplier handles the delta at
  // display time.
  //
  // Any entry with an allergen implication also gets a matching rule
  // added to `src/shared/nutrition-core/dictionary.ts` — the catalog
  // is for pricing + image resolution, the dictionary is what actually
  // gates the safety filters.

  // ── Spice blends (all pantry, no allergens beyond nightshades) ───────
  { key: 'ras el hanout',       unit: 'tsp', usd: 0.15, aliases: ['ras el hanout'],              category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.45 }] },
  { key: 'chaat masala',        unit: 'tsp', usd: 0.12, aliases: ['chaat masala'],               category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.35 }] },
  { key: 'tandoori masala',     unit: 'tsp', usd: 0.12, aliases: ['tandoori masala'],            category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.35 }] },
  { key: 'kadai masala',        unit: 'tsp', usd: 0.12, aliases: ['kadai masala'],               category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.35 }] },
  { key: 'sambar masala',       unit: 'tsp', usd: 0.10, aliases: ['sambar masala'],              category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.30 }] },
  { key: 'pav bhaji masala',    unit: 'tsp', usd: 0.12, aliases: ['pav bhaji masala'],           category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.35 }] },
  { key: 'biryani masala',      unit: 'tsp', usd: 0.12, aliases: ['biryani masala'],             category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.35 }] },
  { key: 'zaatar',              unit: 'tsp', usd: 0.15, aliases: ['zaatar', "za'atar", 'za atar'], category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.45 }] },
  { key: 'gochugaru',           unit: 'tsp', usd: 0.15, aliases: ['gochugaru', 'korean chile flakes'], category: 'spices', alternates: [{ unit: 'tbsp', usd: 0.45 }] },
  { key: 'annatto powder',      unit: 'tsp', usd: 0.10, aliases: ['annatto powder', 'ground annatto', 'annatto'], category: 'spices' },
  { key: 'tajin seasoning',     unit: 'tsp', usd: 0.10, aliases: ['tajin', 'tajín', 'tajin seasoning', 'tajín seasoning'], category: 'spices' },
  { key: 'nigella seeds',       unit: 'tsp', usd: 0.10, aliases: ['nigella seeds', 'nigella', 'kalonji'], category: 'spices' },
  { key: 'fenugreek seeds',     unit: 'tsp', usd: 0.08, aliases: ['fenugreek seed', 'fenugreek seeds', 'methi seeds'], category: 'spices' },
  { key: 'fenugreek leaves',    unit: 'tbsp', usd: 0.20, aliases: ['dried fenugreek leaves', 'fresh fenugreek leaves', 'kasoori methi', 'kasuri methi', 'methi leaves'], category: 'spices' },
  { key: 'herbes de provence',  unit: 'tsp', usd: 0.15, aliases: ['herbes de provence', 'herbes provence'], category: 'spices' },
  { key: 'italian herbs',       unit: 'tsp', usd: 0.10, aliases: ['italian herbs', 'italian herb blend', 'italian herb seasoning'], category: 'spices' },
  { key: 'dried rose petals',   unit: 'tsp', usd: 0.20, aliases: ['dried rose petals', 'rose petals'], category: 'spices' },
  { key: 'cloves',              unit: 'tsp', usd: 0.10, aliases: ['clove', 'cloves'], category: 'spices' },
  { key: 'wasabi powder',       unit: 'tsp', usd: 0.25, aliases: ['wasabi', 'wasabi powder'], category: 'spices' },

  // ── Sauces & pastes ──────────────────────────────────────────────────
  { key: 'doenjang',            unit: 'tbsp', usd: 0.30, aliases: ['doenjang', 'doenjang paste', 'doenjang soybean paste', 'doenjang (fermented soybean paste)', 'doenjang (soybean paste)', 'fermented soybean paste'], category: 'condiments' },
  { key: 'sambal oelek',        unit: 'tbsp', usd: 0.25, aliases: ['sambal oelek', 'sambal'], category: 'condiments' },
  { key: 'zhoug green sauce',   unit: 'tbsp', usd: 0.40, aliases: ['zhoug', 'zhug', 'skhug', 'zhoug green sauce'], category: 'condiments' },
  { key: 'chili crisp oil',     unit: 'tbsp', usd: 0.35, aliases: ['chili crisp', 'chili crisp oil'], category: 'condiments' },
  { key: 'chili paste',         unit: 'tbsp', usd: 0.20, aliases: ['chili paste', 'chili paste (halal)', 'halal chili paste'], category: 'condiments' },
  { key: 'tonkatsu sauce',      unit: 'tbsp', usd: 0.25, aliases: ['tonkatsu sauce', 'tonkatsu-style sauce', 'tonkatsu-style sauce (halal)'], category: 'condiments' },
  { key: 'kaya coconut jam',    unit: 'tbsp', usd: 0.30, aliases: ['kaya', 'kaya coconut jam', 'kaya jam'], category: 'condiments' },
  { key: 'baba ganoush',        unit: 'tbsp', usd: 0.35, aliases: ['baba ganoush', 'babaganoush'], category: 'condiments' },
  { key: 'crema mexicana',      unit: 'tbsp', usd: 0.30, aliases: ['crema mexicana', 'mexican crema'], category: 'dairy' },
  { key: 'seafood stock',       unit: 'cup', usd: 1.00, aliases: ['seafood stock', 'low-sodium seafood stock', 'fish stock'], category: 'canned' },
  { key: 'black vinegar',       unit: 'tbsp', usd: 0.20, aliases: ['black vinegar', 'chinkiang vinegar', 'chinese black vinegar'], category: 'condiments' },
  { key: 'coconut vinegar',     unit: 'tbsp', usd: 0.20, aliases: ['coconut vinegar'], category: 'condiments' },

  // ── Cheeses / dairy (dairy allergen — dictionary rules added below) ─
  { key: 'paneer',              unit: 'oz', usd: 0.75, aliases: ['paneer', 'paneer cubed', 'paneer, cubed', 'paneer (cubed)'], category: 'dairy', alternates: [{ unit: 'cup', usd: 3.20 }, { unit: 'lb', usd: 10.00 }] },
  { key: 'halloumi cheese',     unit: 'oz', usd: 1.30, aliases: ['halloumi cheese', 'halloumi'], category: 'dairy', alternates: [{ unit: 'block', usd: 8.00 }, { unit: 'cup', usd: 5.20 }] },
  { key: 'kaymak clotted cream',unit: 'tbsp', usd: 0.60, aliases: ['kaymak', 'kajmak', 'kaymak clotted cream', 'kajmak clotted cream'], category: 'dairy', alternates: [{ unit: 'cup', usd: 8.00 }] },
  { key: 'turkish white cheese',unit: 'oz', usd: 0.85, aliases: ['turkish white cheese', 'beyaz peynir'], category: 'dairy' },
  { key: 'queijo minas',        unit: 'oz', usd: 0.90, aliases: ['queijo minas', 'queijo minas fresh cheese', 'queijo minas frescal'], category: 'dairy' },
  { key: 'farmer cheese',       unit: 'oz', usd: 0.65, aliases: ['farmer cheese', 'fresh farmer cheese'], category: 'dairy', alternates: [{ unit: 'cup', usd: 2.80 }] },

  // ── Fish / seafood (fish allergen — dictionary rules added below) ──
  { key: 'branzino',            unit: 'lb', usd: 15.00, aliases: ['branzino', 'branzino fillet'], category: 'seafood' },
  { key: 'catfish',             unit: 'lb', usd: 6.50, aliases: ['catfish', 'catfish fillet', 'catfish fillets', 'catfish fillets, thick'], category: 'seafood' },
  { key: 'swordfish',           unit: 'lb', usd: 18.00, aliases: ['swordfish', 'swordfish steak', 'swordfish steaks'], category: 'seafood' },

  // ── Meats (halal-explicit + long-tail cuts) ──────────────────────────
  { key: 'halal beef stew meat',unit: 'lb', usd: 8.50, aliases: ['halal beef stew meat', 'beef stew meat', 'beef stew meat, cubed', 'lean beef stew meat', 'boneless beef chuck', 'beef chuck, cubed', 'beef chuck cubed', 'stew beef'], category: 'meat' },
  { key: 'halal beef shank',    unit: 'lb', usd: 7.50, aliases: ['halal beef shank', 'beef shank'], category: 'meat' },
  { key: 'halal oxtail',        unit: 'lb', usd: 10.00, aliases: ['halal oxtail', 'oxtail'], category: 'meat' },
  { key: 'halal goat stew meat',unit: 'lb', usd: 11.00, aliases: ['halal goat stew meat', 'goat stew meat', 'goat meat'], category: 'meat' },
  { key: 'boneless beef short ribs', unit: 'lb', usd: 12.00, aliases: ['boneless beef short ribs', 'boneless beef short ribs, cubed', 'short ribs cubed'], category: 'meat' },
  { key: 'cooked shredded chicken', unit: 'cup', usd: 3.00, aliases: ['cooked shredded chicken', 'shredded cooked chicken', 'shredded chicken'], category: 'meat', alternates: [{ unit: 'oz', usd: 0.55 }, { unit: 'lb', usd: 8.50 }] },
  { key: 'cooked shredded turkey breast', unit: 'cup', usd: 3.20, aliases: ['cooked shredded turkey breast', 'shredded cooked turkey', 'shredded turkey breast'], category: 'meat', alternates: [{ unit: 'oz', usd: 0.55 }] },
  { key: 'roasted turkey breast', unit: 'oz', usd: 0.65, aliases: ['roasted turkey breast'], category: 'meat' },
  { key: 'boneless turkey thigh', unit: 'lb', usd: 5.50, aliases: ['boneless turkey thigh'], category: 'meat' },
  { key: 'cooked beef rendang', unit: 'cup', usd: 5.00, aliases: ['cooked halal beef rendang', 'cooked beef rendang', 'beef rendang'], category: 'meat' },

  // ── Wheat-based breads / doughs / pastas (gluten — regex covers most) ─
  { key: 'whole-wheat lavash',  unit: 'each', usd: 1.20, aliases: ['whole-wheat lavash', 'whole wheat lavash', 'whole wheat lavash rounds', 'whole-wheat lavash rounds', 'lavash'], category: 'bakery' },
  { key: 'whole-wheat paratha', unit: 'each', usd: 0.80, aliases: ['whole-wheat paratha', 'paratha'], category: 'bakery' },
  { key: 'whole-wheat msemen',  unit: 'each', usd: 0.90, aliases: ['whole-wheat msemen', 'msemen'], category: 'bakery' },
  { key: 'whole-wheat puff pastry', unit: 'oz', usd: 0.35, aliases: ['whole-wheat puff pastry', 'puff pastry', 'whole wheat puff pastry'], category: 'bakery', alternates: [{ unit: 'sheet', usd: 3.50 }] },
  { key: 'whole-wheat pizza dough', unit: 'oz', usd: 0.20, aliases: ['whole-wheat pizza dough', 'whole wheat pizza dough', 'pizza dough'], category: 'bakery', alternates: [{ unit: 'lb', usd: 3.00 }] },
  { key: 'whole-wheat pie crust', unit: 'each', usd: 3.00, aliases: ['whole-wheat pie crust', 'pie crust'], category: 'bakery' },
  { key: 'whole-wheat biscuit dough', unit: 'each', usd: 0.50, aliases: ['whole-wheat biscuit dough', 'biscuit dough'], category: 'bakery' },
  { key: 'whole-grain burger bun', unit: 'each', usd: 0.80, aliases: ['whole-grain burger bun', 'whole grain burger bun', 'burger bun'], category: 'bakery' },
  { key: 'whole-grain waffle',  unit: 'each', usd: 0.60, aliases: ['whole-grain waffle', 'frozen whole-grain waffle', 'whole grain waffle'], category: 'bakery' },
  { key: 'wonton wrappers',     unit: 'each', usd: 0.05, aliases: ['wonton wrappers', 'wonton wrapper', 'whole wheat wonton wrappers'], category: 'bakery', alternates: [{ unit: 'pack', usd: 4.00 }] },
  { key: 'orecchiette',         unit: 'cup', usd: 0.70, aliases: ['orecchiette', 'whole wheat orecchiette'], category: 'grains', alternates: [{ unit: 'oz', usd: 0.20 }, { unit: 'lb', usd: 2.50 }] },
  { key: 'wheat noodles',       unit: 'cup', usd: 0.70, aliases: ['whole-wheat noodles', 'whole wheat noodles', 'thick wheat noodles', 'somen', 'somen or thin wheat noodles', 'thin wheat noodles', 'wheat noodles'], category: 'grains', alternates: [{ unit: 'oz', usd: 0.20 }, { unit: 'lb', usd: 2.50 }] },
  { key: 'freekeh',             unit: 'cup', usd: 1.60, aliases: ['freekeh', 'freekeh grain', 'cracked freekeh'], category: 'grains', alternates: [{ unit: 'lb', usd: 6.50 }] },
  { key: 'cracked wheat',       unit: 'cup', usd: 0.90, aliases: ['cracked wheat'], category: 'grains' },
  { key: 'reshteh noodles',     unit: 'cup', usd: 1.20, aliases: ['reshteh noodles', 'reshteh'], category: 'grains' },
  { key: 'string hopper noodles', unit: 'nest', usd: 0.30, aliases: ['string hopper', 'string hoppers', 'string hopper noodle nests', 'idiyappam'], category: 'grains' },
  { key: 'shirataki noodles',   unit: 'pack', usd: 3.50, aliases: ['shirataki', 'shirataki noodles'], category: 'grains' },
  { key: 'fine semolina',       unit: 'cup', usd: 0.80, aliases: ['fine semolina', 'semolina rava', 'rava', 'sooji'], category: 'grains' },
  { key: 'teff grain',          unit: 'cup', usd: 2.20, aliases: ['teff', 'teff grain'], category: 'grains' },
  { key: 'stone-ground grits',  unit: 'cup', usd: 1.10, aliases: ['stone-ground grits', 'stone ground grits'], category: 'grains' },
  { key: 'rye crackers',        unit: 'each', usd: 0.15, aliases: ['rye crackers'], category: 'bakery' },

  // ── Frozen / dumpling wrappers (wheat allergen — rules below) ────────
  { key: 'dumpling wrappers',   unit: 'each', usd: 0.05, aliases: ['dumpling wrappers', 'dumpling wrapper', 'frozen dumpling wrappers', 'frozen mini dumpling wrappers'], category: 'bakery', alternates: [{ unit: 'pack', usd: 4.50 }] },
  { key: 'frozen molokhia leaves', unit: 'cup', usd: 2.20, aliases: ['molokhia', 'molokhia leaves', 'frozen molokhia leaves', 'jute leaves'], category: 'produce' },
  { key: 'frozen sour cherries',unit: 'cup', usd: 3.00, aliases: ['frozen sour cherries', 'sour cherries'], category: 'produce' },
  { key: 'frozen acai puree',   unit: 'packet', usd: 2.50, aliases: ['acai', 'acai puree', 'frozen acai puree packet', 'acai packet'], category: 'produce' },
  { key: 'pao de queijo',       unit: 'each', usd: 0.60, aliases: ['pao de queijo', 'frozen pao de queijo', 'pão de queijo'], category: 'bakery' },
  { key: 'frozen mixed vegetables', unit: 'cup', usd: 1.20, aliases: ['mixed frozen vegetables', 'frozen mixed vegetables', 'frozen vegetables'], category: 'produce', alternates: [{ unit: 'bag', usd: 3.50 }] },

  // ── Produce (leafy / squash / long-tail) ─────────────────────────────
  { key: 'endive',              unit: 'each', usd: 2.50, aliases: ['endive', 'endive leaves', 'belgian endive'], category: 'produce', alternates: [{ unit: 'leaf', usd: 0.20 }] },
  { key: 'callaloo greens',     unit: 'cup', usd: 1.80, aliases: ['callaloo', 'callaloo greens'], category: 'produce' },
  { key: 'mixed greens',        unit: 'cup', usd: 0.80, aliases: ['mixed greens', 'greek salad greens', 'salad greens', 'mesclun'], category: 'produce', alternates: [{ unit: 'oz', usd: 0.30 }, { unit: 'bag', usd: 4.00 }] },
  { key: 'collard greens',      unit: 'cup', usd: 0.60, aliases: ['collard greens', 'collard green leaves', 'collards'], category: 'produce', alternates: [{ unit: 'bunch', usd: 2.50 }] },
  { key: 'fresh green beans',   unit: 'cup', usd: 1.40, aliases: ['green bean', 'green beans', 'fresh green beans'], category: 'produce', alternates: [{ unit: 'lb', usd: 3.00 }] },
  { key: 'pumpkin cubes',       unit: 'cup', usd: 1.60, aliases: ['pumpkin cubes', 'diced pumpkin'], category: 'produce' },
  { key: 'kabocha squash',      unit: 'cup', usd: 1.80, aliases: ['kabocha', 'kabocha squash', 'kabocha squash, cubed'], category: 'produce', alternates: [{ unit: 'each', usd: 6.00 }] },
  { key: 'jicama',              unit: 'each', usd: 2.50, aliases: ['jicama', 'jicama, peeled and cut'], category: 'produce', alternates: [{ unit: 'cup', usd: 1.20 }] },
  { key: 'bamboo shoots',       unit: 'cup', usd: 1.80, aliases: ['bamboo shoots', 'bamboo'], category: 'produce', alternates: [{ unit: 'can', usd: 2.50 }] },
  { key: 'nopales',             unit: 'each', usd: 1.20, aliases: ['nopales', 'nopales cactus paddles', 'cactus paddles'], category: 'produce' },
  { key: 'mixed crudites',      unit: 'cup', usd: 2.00, aliases: ['mixed crudites', 'mixed crudités', 'crudites'], category: 'produce' },
  { key: 'lotus root',          unit: 'cup', usd: 2.20, aliases: ['lotus root'], category: 'produce' },
  { key: 'konbu',               unit: 'sheet', usd: 0.50, aliases: ['konbu', 'konbu (dried kelp)', 'kombu', 'dried kelp'], category: 'produce' },
  { key: 'wakame',              unit: 'tbsp', usd: 0.40, aliases: ['wakame', 'wakame (dried)', 'dried wakame'], category: 'produce' },
  { key: 'fresh figs',          unit: 'each', usd: 0.75, aliases: ['fresh figs', 'fresh fig', 'figs', 'fig'], category: 'produce', alternates: [{ unit: 'cup', usd: 4.00 }] },
  { key: 'fresh tarragon',      unit: 'tbsp', usd: 0.35, aliases: ['fresh tarragon', 'tarragon'], category: 'spices' },

  // ── Legumes (moong dal variants, all one entry) ──────────────────────
  { key: 'yellow split mung beans', unit: 'cup', usd: 1.20, aliases: ['yellow split mung beans', 'split yellow mung beans', 'split yellow moong dal', 'yellow split moong dal', 'moong dal', 'split moong dal', 'sprouted moong dal', 'sprouted mung beans'], category: 'legumes', alternates: [{ unit: 'lb', usd: 3.20 }] },

  // ── Chiles / peppers (nightshades — dictionary rule expanded below) ─
  { key: 'green chili pepper',  unit: 'each', usd: 0.20, aliases: ['green chili', 'green chile', 'fresh green chili', 'green chili pepper'], category: 'produce' },
  { key: 'thai chile',          unit: 'each', usd: 0.10, aliases: ['thai chili', 'thai chile', 'thai bird chile', 'thai bird chiles', 'thai chile flakes'], category: 'produce', alternates: [{ unit: 'tsp', usd: 0.10 }] },
  { key: 'dried red chiles',    unit: 'each', usd: 0.15, aliases: ['dried red chile', 'dried red chiles', 'dried ancho chiles', 'dried ancho chile', 'ancho chile'], category: 'spices' },

  // ── Sweeteners / beverages ───────────────────────────────────────────
  { key: 'stevia',              unit: 'tsp', usd: 0.10, aliases: ['stevia', 'stevia powder', 'stevia extract'], category: 'pantry' },
  { key: 'black tea bags',      unit: 'each', usd: 0.10, aliases: ['black tea bags', 'black tea', 'tea bag'], category: 'beverages' },

  // ── Baking staples ───────────────────────────────────────────────────
  { key: 'active dry yeast',    unit: 'tsp', usd: 0.20, aliases: ['active dry yeast', 'dry yeast', 'yeast', 'instant yeast'], category: 'pantry', alternates: [{ unit: 'packet', usd: 0.40 }] },

  // ── Preserves / cocoa / seeds ────────────────────────────────────────
  { key: 'lingonberry preserves', unit: 'tbsp', usd: 0.25, aliases: ['lingonberry preserves', 'lingonberry', 'lingonberry jam'], category: 'condiments' },
  { key: 'unsweetened cocoa',   unit: 'tbsp', usd: 0.20, aliases: ['unsweetened cocoa', 'cocoa powder', 'unsweetened cocoa powder'], category: 'pantry' },
  { key: 'cacao nibs',          unit: 'tbsp', usd: 0.35, aliases: ['cacao nibs', 'unsweetened cacao nibs'], category: 'pantry' },
  { key: 'shredded coconut',    unit: 'cup', usd: 1.60, aliases: ['shredded coconut', 'unsweetened shredded coconut', 'coconut'], category: 'pantry', alternates: [{ unit: 'tbsp', usd: 0.10 }, { unit: 'oz', usd: 0.35 }] },
  { key: 'sea bass',            unit: 'lb', usd: 16.00, aliases: ['sea bass', 'sea bass fillet', 'sea bass fillets'], category: 'seafood' },
  { key: 'ground egusi',        unit: 'tbsp', usd: 0.40, aliases: ['egusi', 'ground egusi', 'ground egusi melon seeds', 'egusi seeds'], category: 'pantry' },
  { key: 'canned ackee',        unit: 'can', usd: 8.00, aliases: ['ackee', 'canned ackee'], category: 'canned' },
  { key: 'peeled chestnuts',    unit: 'cup', usd: 4.50, aliases: ['peeled chestnuts', 'chestnut', 'chestnuts'], category: 'nuts' },
  { key: 'makhana',             unit: 'cup', usd: 1.80, aliases: ['makhana', 'fox nuts', 'makhana (fox nuts)', 'lotus seeds'], category: 'pantry' },
  { key: 'natto',               unit: 'oz', usd: 0.75, aliases: ['natto'], category: 'legumes' },
  { key: 'idli batter',         unit: 'cup', usd: 1.20, aliases: ['idli batter', 'idli mix', 'idli batter or mix'], category: 'pantry' },

  // ── Placeholders ─────────────────────────────────────────────────────
  { key: 'water',               unit: 'cup', usd: 0.00, aliases: ['water', 'ice'],               category: 'beverages' },
];

// ─── Unit conversion ─────────────────────────────────────────────────────
// Coarse conversion factors. Only intra-family (mass → mass, volume → volume,
// count → count) — no cross-family guesses ("1 tbsp of chicken" is nonsense
// and returns null, correctly).

const MASS_TO_G: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  tsp: 4.929,
  teaspoon: 4.929,
  teaspoons: 4.929,
  tbsp: 14.787,
  tablespoon: 14.787,
  tablespoons: 14.787,
  cup: 236.588,
  cups: 236.588,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
  'fl oz': 29.574,
  'fluid ounce': 29.574,
};

/** Convert quantity from unit A → unit B when they belong to the same family. */
function convertUnit(qty: number, from: string, to: string): number | null {
  const f = from.trim().toLowerCase();
  const t = to.trim().toLowerCase();
  if (f === t) return qty;

  const fMass = MASS_TO_G[f];
  const tMass = MASS_TO_G[t];
  if (fMass !== undefined && tMass !== undefined) return (qty * fMass) / tMass;

  const fVol = VOLUME_TO_ML[f];
  const tVol = VOLUME_TO_ML[t];
  if (fVol !== undefined && tVol !== undefined) return (qty * fVol) / tVol;

  // Count-like units (each, clove, head, bunch, can, slice, link, scoop,
  // stalk, leaf, bag) don't cross-convert. Return null so callers know.
  return null;
}

// ─── Matcher (mirrors the nutrition catalog's approach) ──────────────────

function normalise(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,.*$/, ' ')
    .replace(/[^a-z0-9 %/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ALIAS_INDEX: Array<{ needle: string; entry: UsBaselinePrice }> = (() => {
  const flat: Array<{ needle: string; entry: UsBaselinePrice }> = [];
  for (const entry of PRICES) {
    for (const alias of entry.aliases) {
      flat.push({ needle: alias.toLowerCase(), entry });
    }
  }
  flat.sort((a, b) => b.needle.length - a.needle.length);
  return flat;
})();

function lookupEntry(name: string): UsBaselinePrice | null {
  const q = normalise(name);
  if (!q) return null;
  for (const { needle, entry } of ALIAS_INDEX) {
    if (q.includes(needle)) return entry;
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Look up the US-baseline USD price for `qty` `unit` of `name`. Returns
 * `null` when:
 *   - the ingredient isn't in the catalog, OR
 *   - the recipe's unit can't be converted to the catalog's canonical unit
 *     (e.g. recipe uses "1 clove garlic" and catalog uses "clove" — that
 *     matches; but "1 tbsp chicken breast" would return null).
 *
 * When null, callers should fall back to whatever `est_price` the recipe
 * row itself carries. This function's contract is deliberately narrow — we
 * never invent a price out of thin air.
 */
export function resolveBaselinePrice(
  name: string,
  qty: number,
  unit: string,
): number | null {
  const entry = lookupEntry(name);
  if (!entry) return null;

  // Primary unit first.
  const primary = convertUnit(qty, unit, entry.unit);
  if (primary !== null) return Math.round(primary * entry.usd * 100) / 100;

  // Fall through to alternate-unit rows attached to the same entry — used
  // when the recipe writes "1 tbsp almonds" but the primary row is per-oz
  // and mass↔volume can't auto-convert.
  for (const alt of entry.alternates ?? []) {
    const converted = convertUnit(qty, unit, alt.unit);
    if (converted !== null) return Math.round(converted * alt.usd * 100) / 100;
  }
  return null;
}

/** Introspection — for tests, admin tools, and the validator's sanity check. */
export function allPriceEntries(): UsBaselinePrice[] {
  return PRICES.slice();
}

export const PRICE_CATALOG_SIZE = PRICES.length;
