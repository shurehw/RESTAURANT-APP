export const dynamic = 'force-dynamic';

/**
 * Recipe Management Page
 * List all recipes with search and filter, plus AI recipe chat
 */

import { createClient } from "@/lib/supabase/server";
import { RecipePageTabs } from "./RecipePageTabs";

export default async function RecipesPage() {
  const supabase = await createClient();

  const { data: recipes } = await supabase
    .from("recipes")
    .select("*")
    .order("name", { ascending: true })
    .limit(50);

  return <RecipePageTabs recipes={recipes || []} />;
}
