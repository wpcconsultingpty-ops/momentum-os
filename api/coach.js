import OpenAI from "openai";
              reflection: {
                type: "string",
              },

              supportStyle: {
                type: "string",
                enum: [
                  "grounding",
                  "simplify",
                  "steady",
                  "protect-energy"
                ],
              },

              gentleSuggestions: {
                type: "array",
                items: {
                  type: "string",
                },
                minItems: 3,
                maxItems: 3,
              },

              reframe: {
                type: "string",
              },

              encouragement: {
                type: "string",
              },

              closingQuestion: {
                type: "string",
              },
            },

            required: [
              "reflection",
              "supportStyle",
              "gentleSuggestions",
              "reframe",
              "encouragement",
              "closingQuestion",
            ],
          },
        },
      },

      temperature: 0.85,
      max_output_tokens: 700,
    });

    const output = response.output_text || "";

    const guide = safeParseGuide(
      output,
      fallbackStyle,
      context
    );

    return res.status(200).json({
      ok: true,
      guide,
      raw: output,

      meta: {
        label: context.overallLabel,
        emotionalState: context.emotionalState,
        supportStyle: guide.supportStyle,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Reflection guide request failed",
      detail: error?.message || "Unknown error",
    });
  }
}
