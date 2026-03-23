import Anthropic from "npm:@anthropic-ai/sdk@0.40.0";
import context from "./context.json" with { type: "json" };

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY")! });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// Supabase REST helper
// ---------------------------------------------------------------------------
async function sbQuery(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Accept: "application/json",
    },
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_campaign_detail",
    description: "Fetch full details for a specific campaign by its campaign_id.",
    input_schema: {
      type: "object" as const,
      required: ["campaign_id"],
      properties: {
        campaign_id: { type: "string", description: "The Klaviyo campaign ID" },
      },
    },
  },
  {
    name: "query_filtered",
    description:
      "Query campaigns with filters — use only when you need data beyond the pre-loaded snapshot.",
    input_schema: {
      type: "object" as const,
      properties: {
        month:   { type: "string", description: "YYYY-MM format, e.g. '2025-04'" },
        sort_by: { type: "string", enum: ["open_rate", "click_rate", "conversion_value", "send_time"] },
        limit:   { type: "integer", description: "Max rows to return (default 20)" },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  if (name === "get_campaign_detail") {
    const cid = input.campaign_id as string;
    const data = await sbQuery("campaigns", {
      select: "campaign_id,label,subject,send_time,open_rate,click_rate,conversion_value,click_to_open_rate,screenshot_path",
      campaign_id: `eq.${cid}`,
    });
    return JSON.stringify(data);
  }

  if (name === "query_filtered") {
    const params: Record<string, string> = {
      select: "campaign_id,label,subject,send_time,open_rate,click_rate,conversion_value,screenshot_path",
      limit:  String(input.limit ?? 20),
      order:  `${input.sort_by ?? "send_time"}.desc`,
    };
    if (input.month) {
      const [y, m] = (input.month as string).split("-");
      const lastDay = new Date(+y, +m, 0).getDate();
      params["send_time"] = `gte.${y}-${m}-01`;
      params["send_time.lte"] = `${y}-${m}-${lastDay}`;
    }
    const data = await sbQuery("campaigns", params);
    return JSON.stringify(data);
  }

  return "Unknown tool";
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an expert Klaviyo email marketing analyst for a healthcare/safety products company.

You have COMPLETE access to all campaign performance data in the snapshot below.
Use this data directly to answer questions — only call tools for very specific lookups not covered here.

FULL CAMPAIGN DATA SNAPSHOT (built: ${(context as Record<string, unknown>).built_at}, ${(context as Record<string, unknown>).total_campaigns} campaigns):
${JSON.stringify(context)}

Instructions:
- Reference actual labels, subjects, open rates, and revenue from the data
- For topic suggestions: identify themes from labels and subjects of top-performing campaigns in the relevant month(s)
- For subject line suggestions: analyze patterns in campaigns with open_rate > 0.30
- Always cite specific numbers (e.g. "This topic had 38% open rate in Nov 2025")
- Format responses with ## headers, **bold** text, and bullet points
- For content ideas, include subject line suggestion + brief content angle + expected performance basis`;

// ---------------------------------------------------------------------------
// Agentic loop
// ---------------------------------------------------------------------------
async function answerQuestion(question: string): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: question },
  ];

  for (let i = 0; i < 10; i++) {
    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      tools:      TOOLS,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
          results.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
      }
      messages.push({ role: "user", content: results });
    }
  }

  return "Unable to process the question after maximum iterations.";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  try {
    const { question } = await req.json();
    if (!question) {
      return Response.json({ error: "No question provided" }, { status: 400 });
    }

    const answer = await answerQuestion(question);
    return Response.json(
      { answer },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err) {
    return Response.json(
      { error: String(err) },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
});
