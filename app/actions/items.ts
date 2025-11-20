'use server';

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth';

export type ItemSearchResult = {
    id: string;
    sku: string;
    name: string;
    category: string;
    base_uom: string;
};

export async function searchItems(query: string): Promise<ItemSearchResult[]> {
    await requireUser();
    const supabase = await createClient();

    if (!query || query.length < 2) {
        return [];
    }

    const { data, error } = await supabase
        .from('items')
        .select('id, sku, name, category, base_uom')
        .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
        .limit(20);

    if (error) {
        console.error('Error searching items:', error);
        return [];
    }

    return data || [];
}
