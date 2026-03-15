import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { guard } from '@/lib/route-guard';
import { requireUser } from '@/lib/auth';
import { getUserOrgAndVenues, assertRole } from '@/lib/tenant';
import { rateLimit } from '@/lib/rate-limit';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  return guard(async () => {
    rateLimit(request, ':recipes-structure-method');
    const user = await requireUser();
    const { role } = await getUserOrgAndVenues(user.id);
    assertRole(role, ['owner', 'admin', 'manager']);

    const body = await request.json();
    const { raw_method, recipe_name, recipe_type } = body as {
      raw_method: string;
      recipe_name?: string;
      recipe_type?: string;
    };

    if (!raw_method || raw_method.trim().length < 10) {
      throw { status: 400, code: 'INVALID_INPUT', message: 'Write at least a few words about the method' };
    }

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `You are a professional culinary editor. The chef has written free-form method notes for ${recipe_name ? `"${recipe_name}"` : 'a recipe'}${recipe_type === 'prepared_item' ? ' (a prep/sub-recipe)' : recipe_type === 'menu_item' ? ' (a menu item)' : ''}. Structure their writing into clean, professional method steps.

Rules:
- Preserve the chef's voice and intent — don't rewrite their technique, just organize it
- Split into logical steps (one action per step)
- Use imperative voice ("Season the duck", not "The duck is seasoned")
- Include temperatures, times, and weights where mentioned
- Separate prep-ahead steps (mise en place, can be done hours/days before) from à la minute steps (done during service)
- If the chef's notes are very sparse, fill in obvious professional technique gaps
- Do NOT add ingredients the chef didn't mention
- Keep it practical — this is for line cooks during service

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "prep_ahead": ["step 1 — done before service", "step 2"],
  "a_la_minute": ["step 1 — done during service/plating", "step 2"],
  "method": ["full combined step 1", "step 2", "..."]
}`,
      messages: [{ role: 'user', content: raw_method }],
    });

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');

    try {
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const structured = JSON.parse(cleaned);
      return NextResponse.json({ structured });
    } catch {
      throw { status: 502, code: 'AI_PARSE_ERROR', message: 'Failed to structure method — try again' };
    }
  });
}
